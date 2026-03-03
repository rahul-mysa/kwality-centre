#!/bin/bash
# Upload Detox test results to Kwality Centre
#
# Usage:
#   ./upload-detox-results.sh <project-id> [results-file] [api-url]
#
# Arguments:
#   project-id    The Kwality Centre project UUID
#   results-file  Path to test-results.json (default: .artifacts/test-results.json)
#   api-url       KC API base URL (default: http://localhost:3000)
#
# Environment:
#   KC_API_KEY    Optional API key for authentication
#
# Example (after running Detox tests):
#   cd apps/mysa-home-e2e
#   ./upload-detox-results.sh 8c74ca2c-3eb8-415b-af0e-f4469b30b57e

set -e

PROJECT_ID="${1:?Usage: $0 <project-id> [results-file] [api-url]}"
RESULTS_FILE="${2:-.artifacts/test-results.json}"
API_URL="${3:-http://localhost:3000}"

if [ ! -f "$RESULTS_FILE" ]; then
  echo "Error: Results file not found: $RESULTS_FILE"
  exit 1
fi

AUTH_HEADER=""
if [ -n "$KC_API_KEY" ]; then
  AUTH_HEADER="-H \"Authorization: Bearer $KC_API_KEY\""
fi

echo "Uploading results from $RESULTS_FILE to $API_URL..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$API_URL/api/projects/$PROJECT_ID/automated-results" \
  -H "Content-Type: application/json" \
  ${KC_API_KEY:+-H "Authorization: Bearer $KC_API_KEY"} \
  -d @"$RESULTS_FILE")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" -eq 201 ]; then
  echo "Uploaded successfully: $BODY"
elif [ "$HTTP_CODE" -eq 409 ]; then
  echo "Duplicate run (already imported): $BODY"
else
  echo "Upload failed (HTTP $HTTP_CODE): $BODY"
  exit 1
fi
