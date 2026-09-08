-- おすすめコメントを「1作品に1つ」から「1票に1つ」へ移す。
-- 投票した人それぞれが、その作品を推す理由を残せるようにする。
begin;

-- 票にコメント・ニックネーム・公開用IDを持たせる。
-- comment_id は管理画面からコメントを名指しするための識別子で、voter_hash を外に出さないために使う。
alter table public.votes add column if not exists comment text not null default '';
alter table public.votes add column if not exists nickname text not null default '';
alter table public.votes add column if not exists comment_id uuid not null default gen_random_uuid();

alter table public.votes drop constraint if exists votes_comment_length;
alter table public.votes add constraint votes_comment_length check (char_length(comment) <= 300);
alter table public.votes drop constraint if exists votes_nickname_length;
alter table public.votes add constraint votes_nickname_length check (char_length(nickname) <= 20);
create unique index if not exists votes_comment_id on public.votes(comment_id);
create index if not exists votes_movie_comment on public.votes(movie_id, created_at desc) where comment <> '';

-- 既存の movies.comment は投稿者本人の言葉なので、その人の票へ移す。
update public.votes v
set comment = m.comment
from public.movies m
where v.movie_id = m.id
  and m.comment <> ''
  and v.comment = ''
  and v.created_at = (select min(v2.created_at) from public.votes v2 where v2.movie_id = m.id);

-- 作品自体はコメントを持たなくなる。ビューが参照しているので先に落とす。
drop view if exists public.movie_rankings;
alter table public.movies drop column if exists comment;

create view public.movie_rankings with (security_invoker = true) as
select m.id, m.title, m.release_year, m.status, m.created_at,
  count(v.movie_id)::integer as vote_count,
  count(v.movie_id) filter (where v.comment <> '')::integer as comment_count
from public.movies m left join public.votes v on v.movie_id = m.id
where m.deleted_at is null group by m.id;
revoke all on public.movie_rankings from public, anon, authenticated;
grant select on public.movie_rankings to service_role;

-- 投稿は「作品＋最初の1票＋その人のコメント」を一度に作る。
drop function if exists public.recommend_movie(text, text, integer, text, text);
create function public.recommend_movie(p_title text, p_normalized text, p_year integer, p_comment text, p_voter text, p_nickname text)
returns uuid language plpgsql set search_path = '' as $$
declare movie uuid;
begin
  if length(p_normalized) = 0 or p_voter !~ '^[a-f0-9]{64}$' then raise exception 'invalid_input'; end if;
  insert into public.movies(title, normalized_title, release_year) values (p_title, p_normalized, p_year) returning id into movie;
  insert into public.votes(movie_id, voter_hash, comment, nickname) values (movie, p_voter, p_comment, p_nickname);
  return movie;
end $$;

-- 投票は上書き可能にする。同じ人が投票し直すとコメントの編集になる。
drop function if exists public.set_movie_vote(uuid, text, boolean);
create function public.set_movie_vote(p_id uuid, p_voter text, p_voted boolean, p_comment text, p_nickname text)
returns void language plpgsql set search_path = '' as $$
declare movie public.movies;
begin
  select * into movie from public.movies where id = p_id and deleted_at is null for update;
  if not found then raise exception 'movie_not_found'; end if;
  if movie.status = 'watched' then raise exception 'voting_closed'; end if;
  if p_voter !~ '^[a-f0-9]{64}$' then raise exception 'invalid_input'; end if;
  if p_voted then
    insert into public.votes(movie_id, voter_hash, comment, nickname) values (p_id, p_voter, p_comment, p_nickname)
    on conflict (movie_id, voter_hash) do update set comment = excluded.comment, nickname = excluded.nickname;
  else
    delete from public.votes where movie_id = p_id and voter_hash = p_voter;
  end if;
end $$;

-- 作品ページ。作品情報と、コメントの付いた票を新しい順で返す。
-- voter_hash は返さず、自分のものかどうかだけを mine で示す。
create or replace function public.movie_detail(p_id uuid, p_voter text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'movie', jsonb_build_object(
      'id', r.id, 'title', r.title, 'release_year', r.release_year, 'status', r.status,
      'created_at', r.created_at, 'vote_count', r.vote_count, 'comment_count', r.comment_count,
      'voted', exists (select 1 from public.votes v where v.movie_id = r.id and v.voter_hash = p_voter),
      'my_comment', coalesce((select v.comment from public.votes v where v.movie_id = r.id and v.voter_hash = p_voter), ''),
      'my_nickname', coalesce((select v.nickname from public.votes v where v.movie_id = r.id and v.voter_hash = p_voter), '')
    ),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.comment_id, 'nickname', c.nickname, 'comment', c.comment,
        'created_at', c.created_at, 'mine', c.voter_hash = p_voter
      ) order by c.created_at desc)
      from public.votes c where c.movie_id = r.id and c.comment <> ''
    ), '[]'::jsonb)
  )
  from public.movie_rankings r where r.id = p_id;
$$;

-- 配信者による不適切コメントの削除。票は残したまま本文だけ消す。
create or replace function public.clear_comment(p_comment_id uuid)
returns boolean language plpgsql set search_path = '' as $$
declare hit integer;
begin
  update public.votes set comment = '', nickname = '' where comment_id = p_comment_id and comment <> '';
  get diagnostics hit = row_count;
  return hit > 0;
end $$;

revoke all on public.movies, public.votes from public, anon, authenticated;
grant all on public.movies, public.votes to service_role;
revoke execute on function
  public.recommend_movie(text, text, integer, text, text, text),
  public.set_movie_vote(uuid, text, boolean, text, text),
  public.movie_detail(uuid, text),
  public.clear_comment(uuid)
  from public, anon, authenticated;
grant execute on function
  public.recommend_movie(text, text, integer, text, text, text),
  public.set_movie_vote(uuid, text, boolean, text, text),
  public.movie_detail(uuid, text),
  public.clear_comment(uuid)
  to service_role;

commit;
