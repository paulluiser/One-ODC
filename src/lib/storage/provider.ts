export const ATTACHMENT_BUCKET = "one-odc-attachments";
export const TARGET_MAX_FILE_BYTES = 100 * 1024 * 1024;
export const CURRENT_MAX_FILE_BYTES = 50 * 1024 * 1024;
export type AttachmentClassification =
  "general" | "design" | "commercial" | "operations";
export type AttachmentAssociation = { kind: "lead" | "project"; id: string };
// Future associations need real foreign keys and entity-specific policies before activation.
export type PlannedAssociationKind =
  | "space"
  | "activity"
  | "quotation"
  | "site_coordination"
  | "supplier"
  | "logistics"
  | "installation";
export type UploadReservation = {
  id: string;
  attachment_id: string;
  object_path: string;
  original_name: string;
  mime_type: string;
  expected_size: number;
  bucket: string;
  max_size: number;
};
export interface ResumableTransfer {
  start(): Promise<void>;
  pause(): Promise<void>;
}
export interface StorageProvider {
  reserve(input: {
    association: AttachmentAssociation;
    classification: AttachmentClassification;
    name: string;
    mimeType: string;
    size: number;
    replacementOf?: string;
  }): Promise<UploadReservation>;
  transfer(
    reservation: UploadReservation,
    file: File,
    onProgress?: (sent: number, total: number) => void,
  ): ResumableTransfer;
  complete(versionId: string): Promise<void>;
  signedDownload(
    versionId: string,
  ): Promise<{ url: string; expiresIn: number }>;
  archive(
    attachmentId: string,
    archived: boolean,
    reason: string,
  ): Promise<void>;
}
export function resumableEndpoint(projectUrl: string) {
  const url = new URL(projectUrl);
  if (/^[a-z0-9]+\.supabase\.co$/.test(url.hostname))
    url.hostname = url.hostname.replace(".supabase.co", ".storage.supabase.co");
  return `${url.origin}/storage/v1/upload/resumable`;
}
