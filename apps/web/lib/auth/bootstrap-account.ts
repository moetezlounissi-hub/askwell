import "server-only";
import { auth } from "@clerk/nextjs/server";

type AccountWriter = {
  from(table: "accounts"): {
    upsert(
      account: { clerk_user_id: string; plan: "free" },
      options: { onConflict: "clerk_user_id"; ignoreDuplicates: true },
    ): PromiseLike<{ error: unknown }>;
  };
};

export async function bootstrapAccount(createServiceClient: () => AccountWriter) {
  const { userId } = await auth.protect();
  const { error } = await createServiceClient()
    .from("accounts")
    .upsert(
      { clerk_user_id: userId, plan: "free" },
      { onConflict: "clerk_user_id", ignoreDuplicates: true },
    );

  if (error) {
    throw new Error("Could not initialize the workspace account.", { cause: error });
  }
}
