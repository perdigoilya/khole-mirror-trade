-- Allow users to add and remove followed Twitter accounts
CREATE POLICY "Anyone can add followed accounts"
ON public.followed_twitter_accounts
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Anyone can remove followed accounts"
ON public.followed_twitter_accounts
FOR DELETE
TO public
USING (true);