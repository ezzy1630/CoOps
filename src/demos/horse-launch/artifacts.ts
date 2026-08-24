import type { ArtifactTemplate } from '../../artifacts/document.js'

/** Every receipt repeats the same checksum so the proof chain reads even muted. */
export const VIDEO_SHA = 'sha256:9f4c8a11d2e7b604c3f5a09d8e21b47c6a5d0f38e9c27b14d6f83a50c1e7b92d'

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
        { k: 'filename', v: 'horse-walkthrough-v3.mp4' },
        { k: 'modified', v: '2026-08-23T14:02:11Z' },
        { k: 'size', v: '259,291,136 bytes (247.3 MB)' },
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
        { k: 'object', v: 'launches/horse-walkthrough-v3.mp4' },
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
        { k: 'video id', v: 'hR73xW9pQmA' },
        { k: 'url', v: 'https://youtu.be/hR73xW9pQmA' },
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