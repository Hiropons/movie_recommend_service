import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visitorIdentity, validOrigin } from '../src/lib/security.ts';
import { commentInput, displayName, movieInput, normalizeTitle } from '../src/lib/model.ts';
test('forged and malformed cookies cannot select a voter identity',()=>{
  const one=visitorIdentity(undefined,'test-key'); assert.equal(one.isNew,true);
  assert.equal(visitorIdentity(one.cookie,'test-key').hash,one.hash);
  assert.equal(visitorIdentity(one.cookie,'wrong-key').isNew,true);
  assert.equal(visitorIdentity(one.cookie.replace(/.$/,'z'),'test-key').isNew,true);
  assert.equal(visitorIdentity('arbitrary-voter','test-key').isNew,true);
  assert.notEqual(visitorIdentity(undefined,'test-key').hash,one.hash);
});
test('cross-origin and missing-origin writes are rejected',()=>{
  const req=(origin,site='same-origin')=>new Request('https://movies.example/api/movies',{headers:{...(origin?{origin}:{}),'sec-fetch-site':site}});
  assert.equal(validOrigin(req('https://movies.example')),true);
  assert.equal(validOrigin(req('https://evil.example')),false);
  assert.equal(validOrigin(req(null)),false);
  assert.equal(validOrigin(req('https://movies.example','cross-site')),false);
});
test('movie input validates years and prevents punctuation-only titles',()=>{
  assert.equal(normalizeTitle(' ＡＲＲＩＶＡＬ！ '),'arrival');
  assert.equal(movieInput({title:'Arrival',release_year:''}).release_year,null);
  assert.throws(()=>movieInput({title:'!!!'}));
  assert.throws(()=>movieInput({title:'Arrival',release_year:true}));
  assert.throws(()=>movieInput({title:'Arrival',release_year:2030.1}));
  assert.throws(()=>movieInput({title:'Arrival',comment:'x'.repeat(301)}));
});
test('nicknames are optional and fall back to 匿名',()=>{
  assert.equal(displayName(''),'匿名');
  assert.equal(displayName('   '),'匿名');
  assert.equal(displayName(' はると '),'はると');
  assert.equal(commentInput({nickname:'  は  る  と '}).nickname,'は る と','空白は1つに畳む');
  assert.equal(commentInput({}).comment,'');
  assert.equal(commentInput(undefined).nickname,'');
  assert.throws(()=>commentInput({nickname:'x'.repeat(21)}));
  assert.throws(()=>commentInput({comment:'x'.repeat(301)}));
});
test('only TMDB-sourced films may carry an id and poster',()=>{
  const picked=movieInput({title:'Interstellar',tmdb_id:157336,poster_path:'/abc-1.jpg'});
  assert.equal(picked.tmdb_id,157336); assert.equal(picked.poster_path,'/abc-1.jpg');
  assert.equal(movieInput({title:'Handwritten'}).tmdb_id,null);
  assert.equal(movieInput({title:'Handwritten',tmdb_id:''}).poster_path,null);
  assert.throws(()=>movieInput({title:'X',poster_path:'/abc.jpg'}),undefined,'TMDB IDなしでポスターは持てない');
  assert.throws(()=>movieInput({title:'X',tmdb_id:157336,poster_path:'https://evil.example/x.jpg'}));
  assert.throws(()=>movieInput({title:'X',tmdb_id:157336,poster_path:'/../../etc/passwd'}));
  assert.throws(()=>movieInput({title:'X',tmdb_id:-1}));
  assert.throws(()=>movieInput({title:'X',tmdb_id:1.5}));
});
