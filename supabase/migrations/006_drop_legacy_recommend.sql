-- 005 で新しい recommend_movie を足したあと、新コードのデプロイが終わってから流す。
-- 旧8引数版はもう誰も呼ばないので落とす。
begin;
drop function if exists public.recommend_movie(text, text, integer, text, text, text, integer, text);
commit;
