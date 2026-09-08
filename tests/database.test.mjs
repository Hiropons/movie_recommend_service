import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');

test('PostgreSQL schema, atomic votes, rankings and access controls', async t => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
    // PGlite uses PostgreSQL core gen_random_uuid; only the unused extension install is omitted.
    await db.exec((await migration('001_initial.sql')).replace('create extension if not exists pgcrypto;', ''));
    await db.exec(await migration('002_v1.sql'));
    const voter = 'a'.repeat(64), other = 'b'.repeat(64), third = 'c'.repeat(64);
    const query = (sql, args = []) => db.query(sql, args);

    // 003より前の仕様で投稿された作品を用意し、コメントが票へ移されることを確かめる。
    const legacy = (await query('select recommend_movie($1,$2,$3,$4,$5) id', ['Legacy', 'legacy', 1999, '旧仕様のコメント', voter])).rows[0].id;
    await db.exec(await migration('003_comments.sql'));
    await db.exec(await migration('004_tmdb.sql'));

    const create = async (title, year = null, opts = {}) => {
      const { comment = 'ネタバレなし', nickname = '', tmdb = null, poster = null } = opts;
      return (await query('select recommend_movie($1,$2,$3,$4,$5,$6,$7,$8) id', [title, title.toLowerCase(), year, comment, voter, nickname, tmdb, poster])).rows[0].id;
    };
    const vote = (id, who, voted, comment = '', nickname = '') => query('select set_movie_vote($1,$2,$3,$4,$5)', [id, who, voted, comment, nickname]);
    const list = async (filter = 'all', search = '', offset = 0, limit = 30) => (await query('select list_movies($1,$2,$3,$4,$5,$6) feed', [voter, search, filter, 'votes', offset, limit])).rows[0].feed;
    const detail = async (id, who = voter) => (await query('select movie_detail($1,$2) d', [id, who])).rows[0].d;

    let first, second;
    await t.test('the old per-movie comment moves onto its author vote', async () => {
      const moved = await query('select comment, nickname from votes where movie_id = $1', [legacy]);
      assert.equal(moved.rows[0].comment, '旧仕様のコメント');
      assert.equal(moved.rows[0].nickname, '');
      const view = await detail(legacy);
      assert.equal(view.comments.length, 1);
      assert.equal(view.comments[0].comment, '旧仕様のコメント');
      assert.equal(view.comments[0].mine, true);
    });
    await t.test('a new recommendation includes exactly one vote', async () => {
      first = await create('Arrival', 2016); const feed = await list('all', 'arrival');
      assert.equal(feed.total, 1); assert.equal(feed.movies[0].vote_count, 1); assert.equal(feed.movies[0].voted, true); assert.equal(feed.movies[0].comment_count, 1);
    });
    await t.test('duplicate titles are blocked with and without a year', async () => {
      await assert.rejects(() => create('Arrival', 2016), /duplicate/);
      second = await create('Unknown'); await assert.rejects(() => create('Unknown'), /duplicate/); assert.equal((await list()).total, 3);
    });
    await t.test('the same TMDB film cannot be posted twice under different titles', async () => {
      await create('インターステラー', 2014, { tmdb: 157336, poster: '/abc.jpg' });
      await assert.rejects(() => create('Interstellar', 2014, { tmdb: 157336 }), /duplicate/);
      // TMDBに無い作品は tmdb_id が null のまま重ならない。
      await create('Handwritten One'); await create('Handwritten Two');
    });
    await t.test('failed first vote rolls the entire recommendation back', async () => {
      await assert.rejects(() => query('select recommend_movie($1,$2,$3,$4,$5,$6,$7,$8)', ['Rollback', 'rollback', null, '', null, '', null, null]));
      assert.equal((await list('all', 'rollback')).total, 0);
    });
    await t.test('repeat requests do not duplicate votes; cancellation only removes own vote', async () => {
      await Promise.all(Array.from({ length: 8 }, () => vote(second, other, true)));
      assert.equal((await list('all', 'unknown')).movies[0].vote_count, 2);
      await vote(second, other, false);
      const feed = await list('all', 'unknown');
      assert.equal(feed.movies[0].vote_count, 1); assert.equal(feed.movies[0].voted, true);
    });
    await t.test('a vote carries its own comment and nickname', async () => {
      await vote(second, other, true, '空気感がすごい', 'はると');
      await vote(second, third, true, '', '');
      const view = await detail(second, other);
      assert.equal(view.movie.vote_count, 3);
      assert.equal(view.movie.comment_count, 2);
      assert.equal(view.movie.my_comment, '空気感がすごい');
      assert.equal(view.movie.my_nickname, 'はると');
      // コメントを書いていない票は一覧に並ばない。
      assert.equal(view.comments.length, 2);
      assert.equal(view.comments.filter(c => c.mine).length, 1);
      assert.ok(view.comments.every(c => !('voter_hash' in c)));
    });
    await t.test('voting again rewrites the comment instead of adding a second one', async () => {
      await vote(second, other, true, '二度目の言葉', 'はると2');
      const view = await detail(second, other);
      assert.equal(view.movie.vote_count, 3);
      assert.equal(view.movie.my_comment, '二度目の言葉');
      assert.equal(view.comments.filter(c => c.mine).length, 1);
    });
    await t.test('cancelling a vote removes that person comment as well', async () => {
      await vote(second, other, false);
      const view = await detail(second, other);
      assert.equal(view.movie.vote_count, 2);
      assert.equal(view.movie.voted, false);
      assert.equal(view.movie.my_comment, '');
      assert.equal(view.comments.filter(c => c.comment === '二度目の言葉').length, 0);
    });
    await t.test('the streamer can clear a single comment without losing the vote', async () => {
      await vote(second, other, true, '消される予定', 'あらし');
      const target = (await detail(second, other)).comments.find(c => c.comment === '消される予定');
      assert.equal((await query('select clear_comment($1) ok', [target.id])).rows[0].ok, true);
      const view = await detail(second, other);
      assert.equal(view.movie.vote_count, 3, '票は残る');
      assert.equal(view.movie.my_comment, '');
      assert.equal(view.comments.filter(c => c.comment === '消される予定').length, 0);
      // 同じコメントを二度消しても false を返すだけで壊れない。
      assert.equal((await query('select clear_comment($1) ok', [target.id])).rows[0].ok, false);
    });
    await t.test('watched films close voting and move out of the unwatched filter', async () => {
      await query("update movies set status='watched' where id=$1", [first]);
      await assert.rejects(() => vote(first, other, true), /voting_closed/);
      assert.equal((await list('watched')).movies[0].id, first);
      assert.equal((await list('all', 'arri')).total, 1);
    });
    await t.test('deletion is reversible; hidden movies cannot receive votes', async () => {
      const before = (await list()).total;
      await query('update movies set deleted_at=now() where id=$1', [second]);
      assert.equal((await list()).total, before - 1);
      await assert.rejects(() => vote(second, other, true), /movie_not_found/);
      assert.equal(await detail(second), null, '削除した作品は詳細も返らない');
      await query('update movies set deleted_at=null where id=$1', [second]);
      assert.equal((await list()).total, before);
    });
    await t.test('pagination returns total separately, including an empty page', async () => {
      const total = (await list()).total;
      assert.equal((await list('all', '', 0, 1)).movies.length, 1);
      assert.equal((await list('all', '', total + 3, 1)).total, total);
      assert.equal((await list('all', '', total + 3, 1)).movies.length, 0);
    });
    await t.test('rate limits persist and reset after expiry', async () => {
      for (let i = 0; i < 3; i++) assert.equal((await query("select consume_rate_limit('test',60,3) allowed")).rows[0].allowed, true);
      assert.equal((await query("select consume_rate_limit('test',60,3) allowed")).rows[0].allowed, false);
      await query("update request_limits set expires_at=now()-interval '1 second' where bucket='test'");
      assert.equal((await query("select consume_rate_limit('test',60,3) allowed")).rows[0].allowed, true);
    });
    await t.test('public and signed-in clients cannot bypass the application API', async () => {
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        for (const sql of ['select * from movies', 'select * from votes', 'select * from movie_rankings',
          "select consume_rate_limit('bypass',1,1)", "select list_movies('a','','all','votes',0,30)",
          `select movie_detail('${second}','${voter}')`, `select clear_comment('${second}')`,
          `select set_movie_vote('${second}','${voter}',true,'','')`]) await assert.rejects(() => query(sql), /permission denied/);
        await db.exec('reset role');
      }
      await db.exec('set role service_role'); assert.ok((await list()).total > 0); await db.exec('reset role');
    });
  } finally { await db.close(); }
});
