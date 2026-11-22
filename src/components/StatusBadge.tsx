import { Badge, type Tone } from "@/components/ui";
import type { JobStatus, Summary, Verification, VersionStatus } from "@/lib/contracts";

type Labels<K extends string> = Record<K, readonly [Tone, string]>;

/** Look up a badge, degrading to a neutral one for values this build doesn't know yet. */
function lookup<K extends string>(table: Labels<K>, key: string): readonly [Tone, string] {
  return Object.hasOwn(table, key) ? table[key as K] : ["neutral", key.replaceAll("_", " ")];
}

const DOC: Labels<VersionStatus> = {
  uploaded: ["neutral", "Uploaded"], queued: ["info", "Queued"], processing: ["info", "Processing"],
  ready: ["ok", "Ready"], failed: ["bad", "Failed"],
};
export function DocStatus({ status }: { status: VersionStatus }) {
  const [tone, label] = lookup(DOC, status);
  return <Badge tone={tone}>{label}</Badge>;
}

const JOB: Labels<JobStatus> = {
  pending: ["neutral", "pending"], running: ["info", "running"], succeeded: ["ok", "succeeded"],
  failed: ["bad", "failed"], skipped: ["neutral", "skipped"],
};
export function JobBadge({ status, prefix = "" }: { status: string; prefix?: string }) {
  const [tone, label] = lookup(JOB, status);
  return <Badge tone={tone}>{prefix}{label}</Badge>;
}

const VER: Labels<Verification> = {
  verified: ["ok", "Verified"], partial: ["warn", "Partially supported"], unsupported: ["bad", "Unsupported"],
  unverified: ["neutral", "Unverified"],
};
export function VerificationBadge({ v }: { v: Verification }) {
  const [tone, label] = lookup(VER, v);
  return <Badge tone={tone}>{label}</Badge>;
}

const SUM: Labels<Summary> = {
  verified: ["ok", "All claims verified"], partially_verified: ["warn", "Partially verified"],
  insufficient_evidence: ["bad", "Insufficient evidence"],
};
export function SummaryBadge({ s }: { s: Summary }) {
  const [tone, label] = lookup(SUM, s);
  return <Badge tone={tone}>{label}</Badge>;
}
