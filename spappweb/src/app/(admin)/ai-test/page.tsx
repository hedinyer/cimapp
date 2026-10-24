import { AiTestChat } from "@/components/ai-test/ai-test-chat";
import { getAdminClientReferralScope } from "@/lib/auth/admin-client-scope";

export default async function AiTestPage() {
  const hideEquipo = Boolean(await getAdminClientReferralScope());
  return <AiTestChat hideEquipo={hideEquipo} />;
}
