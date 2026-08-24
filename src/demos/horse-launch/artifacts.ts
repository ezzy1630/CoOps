import type { ArtifactTemplate } from '../../artifacts/document.js'
import type { Receipt } from '../../types.js'

/** Every receipt repeats the same checksum so the proof chain reads even muted. */
export const VIDEO_SHA = 'sha256:9f4c8a11d2e7b604c3f5a09d8e21b47c6a5d0f38e9c27b14d6f83a50c1e7b92d'
export const VIDEO_SIZE = '259,291,136 bytes (247.3 MB)'
export const VIDEO_FILENAME = 'horse-walkthrough-v3.mp4'
export const VIDEO_ID = 'hR73xW9pQmA'

export const HORSE_DISCOVERY_TEMPLATE = {
  docType: 'brief',
  label: 'DISCOVERY MANIFEST',
  blocks: [
    {
      kind: 'para',
      text: 'Developer Machine Connector scanned the allow-listed export directory on Alex Rivera’s laptop and identified one launch-video candidate. No path outside the allow-list was read.',
    },
    {
      kind: 'fields',
      rows: [
        { k: 'connector', v: 'w-connector · Developer Machine Connector' },
        { k: 'allow-listed root', v: 'D:\\exports\\horsewalk\\' },
        { k: 'filename', v: VIDEO_FILENAME },
        { k: 'modified', v: '2026-08-23T14:02:11Z' },
        { k: 'size', v: VIDEO_SIZE },
        { k: 'checksum', v: VIDEO_SHA },
      ],
    },
    {
      kind: 'note',
      text: 'Two older takes (v1, v2) were present and ignored: superseded by filename convention.',
      tone: 'human',
    },
    { kind: 'sign', name: 'Alex Rivera', role: 'Senior Engineer · export owner' },
  ],
} satisfies ArtifactTemplate

export const HORSE_STAGING_TEMPLATE = {
  docType: 'brief',
  label: 'CLOUD STAGING RECEIPT',
  title: 'Verified upload to Cloud Storage',
  blocks: [
    {
      kind: 'para',
      text: 'The verified object crossed into Cloud Storage through a scoped service handoff. Byte count and checksum were recomputed after upload and match the local manifest exactly.',
    },
    {
      kind: 'fields',
      rows: [
        { k: 'bucket', v: 'coops-horse-staging' },
        { k: 'object', v: `launches/${VIDEO_FILENAME}` },
        { k: 'generation', v: '1724428800123456' },
        { k: 'bytes uploaded', v: '259,291,136' },
        { k: 'status', v: 'uploaded · integrity verified' },
        { k: 'checksum', v: VIDEO_SHA },
      ],
    },
    { kind: 'sign', name: 'CoOps staging', role: 'scoped handoff · no credential shared' },
  ],
} satisfies ArtifactTemplate

export const HORSE_YOUTUBE_TEMPLATE = {
  docType: 'brief',
  label: 'PUBLICATION RECEIPT',
  title: 'Uploaded to the launch channel',
  blocks: [
    {
      kind: 'para',
      text: 'Publication paused until the named Marketing approver authorized it. After approval, the Marketing-owned publisher uploaded the staged object to YouTube via videos.insert. The API result is recorded below.',
    },
    {
      kind: 'fields',
      rows: [
        { k: 'channel', v: 'Horse Launch Co (launch channel)' },
        { k: 'title', v: 'Horse Dating App — Official Walkthrough v3' },
        { k: 'privacy', v: 'private (ready for release)' },
        { k: 'processing', v: 'processed' },
        { k: 'video id', v: VIDEO_ID },
        { k: 'url', v: `https://youtu.be/${VIDEO_ID}` },
        { k: 'approved by', v: 'Maya Chen · GTM Lead' },
        { k: 'checksum', v: VIDEO_SHA },
      ],
    },
    {
      kind: 'note',
      text: 'New API projects are restricted to private uploads until audit. The video is uploaded privately to the launch channel and ready for release.',
      tone: 'guard',
    },
    { kind: 'sign', name: 'Maya Chen', role: 'GTM Lead · publication approval' },
  ],
} satisfies ArtifactTemplate

export const HORSE_DISCOVERY_RECEIPT: Receipt = {
  kind: 'local-discovery',
  claim: 'The launch video was found on Alex’s laptop inside the allow-listed export folder.',
  live: false,
  ok: true,
  at: '2026-08-23T14:02:11Z',
  fields: {
    connector: 'w-connector · Developer Machine Connector',
    searchRoot: 'D:\\exports\\horsewalk\\',
    filename: VIDEO_FILENAME,
    modifiedAt: '2026-08-23T14:02:11Z',
    bytes: '259,291,136',
    checksum: VIDEO_SHA,
  },
}

export const HORSE_STAGING_RECEIPT: Receipt = {
  kind: 'cloud-handoff',
  claim: 'The verified bytes were staged to Cloud Storage with matching checksum.',
  live: false,
  ok: true,
  at: '2026-08-23T14:05:40Z',
  fields: {
    bucket: 'coops-horse-staging',
    object: `launches/${VIDEO_FILENAME}`,
    generation: '1724428800123456',
    bytesUploaded: '259,291,136',
    checksum: VIDEO_SHA,
    status: 'uploaded · integrity verified',
  },
}

export const HORSE_AUTHORITY_RECEIPT: Receipt = {
  kind: 'authority',
  claim: 'Maya Chen approved YouTube publication of the verified asset.',
  live: false,
  ok: true,
  at: '2026-08-23T14:06:12Z',
  fields: {
    approver: 'Maya Chen · GTM Lead',
    channel: 'Horse Launch Co (launch channel)',
    title: 'Horse Dating App — Official Walkthrough v3',
    privacy: 'private (ready for release)',
    checksum: VIDEO_SHA,
    approvedAt: '2026-08-23T14:06:12Z',
  },
}

export const HORSE_YOUTUBE_RECEIPT: Receipt = {
  kind: 'publication',
  claim: 'The launch video was uploaded to YouTube and returned a valid video id.',
  live: false,
  ok: true,
  at: '2026-08-23T14:07:05Z',
  fields: {
    apiResult: 'videos.insert · 200 OK',
    videoId: VIDEO_ID,
    privacyStatus: 'private',
    processingStatus: 'processed',
    url: `https://youtu.be/${VIDEO_ID}`,
  },
}