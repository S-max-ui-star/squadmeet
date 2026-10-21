#!/usr/bin/env bash
# Daily snapshot of the host's disk (SCRUM-49 review). The database lives in a Docker volume on
# this one EBS disk; without a snapshot a lost instance loses all data. Creates (or updates):
#   1. the AWS default role for Data Lifecycle Manager (AWSDataLifecycleManagerDefaultRole),
#   2. a DLM policy: every day at 03:00 UTC a snapshot of the instance tagged Name=squadmeet,
#      the newest KEEP of them stay.
# The snapshots are incremental; for this 20 GB disk they cost well under 1 USD a month.
# host-deploy.sh also dumps the database before each deploy (backups/ on the host); that
# helps after a failed migration, this helps when the host itself is gone.
# Safe to run again.
#
# Usage: deploy/setup-backup.sh   (AWS_REGION must be set)
# Needs: aws (CLI v2, logged in), jq.
# Restore: deploy/README.md → Backups.
set -euo pipefail

: "${AWS_REGION:?}"
export AWS_REGION
NAME="squadmeet"
KEEP=7
DESCRIPTION="$NAME daily snapshot"

aws dlm create-default-role --resource-type snapshot >/dev/null
role_arn=$(aws iam get-role --role-name AWSDataLifecycleManagerDefaultRole \
  --query Role.Arn --output text)
echo "✓ Role for Data Lifecycle Manager: $role_arn"

details=$(jq -n --arg name "$NAME" --argjson keep "$KEEP" '{
  PolicyType: "EBS_SNAPSHOT_MANAGEMENT",
  ResourceTypes: ["INSTANCE"],
  TargetTags: [{Key: "Name", Value: $name}],
  Schedules: [{
    Name: "daily",
    CopyTags: true,
    CreateRule: {Interval: 24, IntervalUnit: "HOURS", Times: ["03:00"]},
    RetainRule: {Count: $keep}}]}')

policy_id=$(aws dlm get-lifecycle-policies \
  --query "Policies[?Description=='$DESCRIPTION'].PolicyId | [0]" --output text)
if [[ "$policy_id" != None && -n "$policy_id" ]]; then
  aws dlm update-lifecycle-policy --policy-id "$policy_id" --state ENABLED \
    --execution-role-arn "$role_arn" --policy-details "$details"
  echo "✓ DLM policy $policy_id updated"
else
  policy_id=$(aws dlm create-lifecycle-policy --description "$DESCRIPTION" --state ENABLED \
    --execution-role-arn "$role_arn" --policy-details "$details" \
    --query PolicyId --output text)
  echo "✓ DLM policy $policy_id created"
fi
echo "Every day at 03:00 UTC a snapshot of the instance Name=$NAME; the newest $KEEP stay."
echo "Check later: aws ec2 describe-snapshots --owner-ids self --filters Name=tag:Name,Values=$NAME"
