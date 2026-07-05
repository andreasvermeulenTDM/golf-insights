/**
 * One-time helper to set a permanent password for the single owner user after
 * ApiStack has created the Cognito account (see ownerEmail in infra/cdk.json).
 * Cognito creates the user in FORCE_CHANGE_PASSWORD state with a temp password
 * emailed to them; this script sets a real password directly via AdminSetUserPassword
 * so the owner can log in without the email round-trip.
 *
 * Usage: npx ts-node scripts/seed-cognito-user.ts <user-pool-id> <email> <new-password>
 */
import {
  CognitoIdentityProviderClient,
  AdminSetUserPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";

async function main() {
  const [userPoolId, email, password] = process.argv.slice(2);
  if (!userPoolId || !email || !password) {
    console.error(
      "Usage: npx ts-node scripts/seed-cognito-user.ts <user-pool-id> <email> <new-password>"
    );
    process.exit(1);
  }

  const client = new CognitoIdentityProviderClient({});
  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: email,
      Password: password,
      Permanent: true,
    })
  );
  console.log(`Password set for ${email} in pool ${userPoolId}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
