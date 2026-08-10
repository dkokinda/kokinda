#!/usr/bin/env bash
#
# Creates the Entra app registration planner-api signs in with, and prints the
# two values that go in .env.
#
# Run from Azure Cloud Shell (the >_ icon in the portal), or anywhere with the
# Azure CLI signed in as a tenant admin:
#
#   bash scripts/register-app.sh
#
set -euo pipefail

GRAPH=00000003-0000-0000-c000-000000000000
APP_NAME="${APP_NAME:-kokinda planner-api}"

# Resolve delegated permission GUIDs by name rather than hardcoding them, so a
# stale or mistyped id can't silently register the wrong permission.
scope_id() {
  local id
  id=$(az ad sp show --id "$GRAPH" --query "oauth2PermissionScopes[?value=='$1'].id | [0]" -o tsv)
  if [ -z "$id" ] || [ "$id" = "None" ]; then
    echo "Could not resolve the delegated scope '$1' on Microsoft Graph." >&2
    exit 1
  fi
  printf '%s' "$id"
}

USER_READ=$(scope_id User.Read)
TASKS_RW=$(scope_id Tasks.ReadWrite)
GROUP_READ=$(scope_id Group.Read.All)

# --is-fallback-public-client is the CLI name for "Allow public client flows",
# which the device code grant does not work without.
APP_ID=$(az ad app create \
  --display-name "$APP_NAME" \
  --sign-in-audience AzureADMyOrg \
  --is-fallback-public-client true \
  --required-resource-accesses "[{\"resourceAppId\":\"$GRAPH\",\"resourceAccess\":[
      {\"id\":\"$USER_READ\",\"type\":\"Scope\"},
      {\"id\":\"$TASKS_RW\",\"type\":\"Scope\"},
      {\"id\":\"$GROUP_READ\",\"type\":\"Scope\"}]}]" \
  --query appId -o tsv)

# Consent is granted against the service principal, which does not exist until
# it is created in this tenant.
az ad sp create --id "$APP_ID" >/dev/null

# Only Group.Read.All actually requires an admin to consent; the others are
# user-consentable. Granting all three here keeps the first login promptless.
az ad app permission admin-consent --id "$APP_ID"

cat <<EOF

App registration created. Put these in apps/planner-api/.env:

GRAPH_CLIENT_ID=$APP_ID
GRAPH_TENANT_ID=$(az account show --query tenantId -o tsv)

Then: npm install && npm run login && npm start
EOF
