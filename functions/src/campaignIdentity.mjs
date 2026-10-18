import { digest, workFail } from './workProgressContracts.mjs';

export function campaignIdentityToken(uid, campaignId, snapshot) {
  const stamp = snapshot?.createTime;
  if (
    !stamp ||
    !Number.isSafeInteger(stamp.seconds) ||
    !Number.isInteger(stamp.nanoseconds) ||
    stamp.nanoseconds < 0 ||
    stamp.nanoseconds >= 1e9
  )
    workFail('failed-precondition', 'Não foi possível conferir a identidade da campanha.');
  return digest({
    version: 1,
    uid,
    campaignId,
    createTime: { seconds: stamp.seconds, nanoseconds: stamp.nanoseconds },
  });
}
