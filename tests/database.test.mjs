import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL schema, atomic votes, rankings and access controls', async t => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
    // PGlite uses PostgreSQL core gen_random_uuid; only the unused extension install is omitted.
    await db.exec((await readFile(new URL('../supabase/migrations/001_initial.sql', import.meta.url), 'utf8')).replace('create extension if not exists pgcrypto;', ''));
    await db.exec(await readFile(new URL('../supabase/migrations/002_v1.sql', import.meta.url), 'utf8'));
    const voter = 'a'.repeat(64), other = 'b'.repeat(64);
    const query = (sql, args = []) => db.query(sql, args);
    const create = async (title, year = null) => (await query('select recommend_movie($1,$2,$3,$4,$5) id', [title, title.toLowerCase(), year, 'ネタバレなし', voter])).rows[0].id;
    const list = async (filter = 'all', search = '', offset = 0, limit = 30) => (await query('select list_movies($1,$2,$3,$4,$5,$6) feed', [voter, search, filter, 'votes', offset, limit])).rows[0].feed;
    let first, second;
    await t.test('a new recommendation includes exactly one vote', async () => {
      first = await create('Arrival', 2016); const feed = await list(); assert.equal(feed.total, 1); assert.equal(feed.movies[0].vote_count, 1); assert.equal(feed.movies[0].voted, true);
    });
    await t.test('duplicate titles are blocked with and without a year', async () => {
      await assert.rejects(() => create('Arrival', 2016), /duplicate/);
      second = await create('Unknown'); await assert.rejects(() => create('Unknown'), /duplicate/); assert.equal((await list()).total, 2);
    });
    await t.test('failed first vote rolls the entire recommendation back', async () => {
      await assert.rejects(() => query('select recommend_movie($1,$2,$3,$4,$5)', ['Rollback','rollback',null,'',null]));
      assert.equal((await list('all','rollback')).total, 0);
    });
    await t.test('repeat requests do not duplicate votes; cancellation only removes own vote', async () => {
      await Promise.all(Array.from({length:8}, () => query('select set_movie_vote($1,$2,true)', [second,other])));
      assert.equal((await list()).movies[0].id, second); assert.equal((await list()).movies[0].vote_count, 2);
      await query('select set_movie_vote($1,$2,false)', [second,other]);
      const feed = await list(); assert.equal(feed.movies.find(m=>m.id===second).vote_count,1); assert.equal(feed.movies.find(m=>m.id===second).voted,true);
    });
    await t.test('watched films close voting and move out of the unwatched filter', async () => {
      await query("update movies set status='watched' where id=$1",[first]);
      await assert.rejects(()=>query('select set_movie_vote($1,$2,true)',[first,other]),/voting_closed/);
      assert.equal((await list('watched')).movies[0].id,first); assert.equal((await list('unwatched')).total,1);
      assert.equal((await list('all','arri')).total,1);
    });
    await t.test('deletion is reversible; hidden movies cannot receive votes',async()=>{
      await query('update movies set deleted_at=now() where id=$1',[second]); assert.equal((await list()).total,1);
      await assert.rejects(()=>query('select set_movie_vote($1,$2,true)',[second,other]),/movie_not_found/);
      await query('update movies set deleted_at=null where id=$1',[second]); assert.equal((await list()).total,2);
      assert.equal((await list('all','unknown')).movies[0].vote_count,1);
    });
    await t.test('pagination returns total separately, including an empty page',async()=>{
      assert.equal((await list('all','',0,1)).movies.length,1); assert.equal((await list('all','',5,1)).total,2); assert.equal((await list('all','',5,1)).movies.length,0);
    });
    await t.test('rate limits persist and reset after expiry',async()=>{
      for(let i=0;i<3;i++) assert.equal((await query("select consume_rate_limit('test',60,3) allowed")).rows[0].allowed,true);
      assert.equal((await query("select consume_rate_limit('test',60,3) allowed")).rows[0].allowed,false);
      await query("update request_limits set expires_at=now()-interval '1 second' where bucket='test'");
      assert.equal((await query("select consume_rate_limit('test',60,3) allowed")).rows[0].allowed,true);
    });
    await t.test('public and signed-in clients cannot bypass the application API',async()=>{
      for(const role of ['anon','authenticated']) {
        await db.exec(`set role ${role}`);
        for(const sql of ['select * from movies','select * from votes','select * from movie_rankings',"select consume_rate_limit('bypass',1,1)","select list_movies('a','','all','votes',0,30)"]) await assert.rejects(()=>query(sql),/permission denied/);
        await db.exec('reset role');
      }
      await db.exec('set role service_role'); assert.equal((await list()).total,2); await db.exec('reset role');
    });
  } finally { await db.close(); }
});
