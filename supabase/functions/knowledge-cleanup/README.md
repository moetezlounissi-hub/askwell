# Knowledge cleanup on Supabase dev

After the migration merges and is applied to the shared free dev project, deploy this function to that project with JWT verification disabled at the gateway. The function verifies its own dedicated bearer token. Set a random `KNOWLEDGE_CLEANUP_TOKEN` as an Edge Function secret. Store the same token in Vault under `knowledge_cleanup_token` and the dev project URL under `knowledge_cleanup_project_url`. The function uses the Edge runtime's default Supabase secret key for Storage and RPC calls.

```sh
supabase functions deploy knowledge-cleanup --project-ref "$DEV_PROJECT_REF" --no-verify-jwt
```

Once the migration, function, and secrets are in place, enable Supabase Cron and pg_net in the dev Dashboard and schedule the worker with the following SQL.

```sql
select cron.schedule(
  'askwell-knowledge-cleanup',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
            where name = 'knowledge_cleanup_project_url') || '/functions/v1/knowledge-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                    where name = 'knowledge_cleanup_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $job$
);
```

Verify that an upload already in flight is rejected after revocation and leaves no stored bytes. Verify that a failed cleanup survives a worker restart and is acknowledged only after Storage removes the object. Use disposable files and accounts on dev.
