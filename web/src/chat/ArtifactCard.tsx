import { useState } from "react";
import { downloadFileFromApi } from "../files/download";
import { Download, Eye } from "lucide-react";
import { api } from "../api/client";
import { formatBytes } from "../state/store";
import { Modal, fileIconLabel } from "../components/ui";
import { useI18n } from "../i18n";
import type { FileRef } from "../types";

function isImage(file: FileRef): boolean {
  return file.kind === "image" || (file.mime ?? "").startsWith("image/");
}

/** One produced file: icon, name, size, download link and inline preview for images. */
export function ArtifactCard({ file }: { file: FileRef }) {
  const { t } = useI18n();
  const [preview, setPreview] = useState(false);
  const image = isImage(file);

  return (
    <div className="artifact-card artifact-card-stack">
      <div className="row artifact-head">
        <div className="artifact-icon">{fileIconLabel(file.kind)}</div>
        <div className="grow min-w-0">
          <div className="bold truncate" title={file.name}>
            {file.name}
          </div>
          <div className="tiny faint">{formatBytes(file.size ?? 0)}</div>
        </div>
        <div className="row gap-2">
          {image && (
            <button className="btn btn-sm btn-ghost" onClick={() => setPreview(true)} type="button">
              <Eye size={14} /> {t("chat.artifact.view")}
            </button>
          )}
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => void downloadFileFromApi(file.id, file.name)}
            title={t("chat.artifact.download")}
          >
            <Download size={14} /> {t("chat.artifact.downloadShort")}
          </button>
        </div>
      </div>

      {image && (
        <img
          className="artifact-preview"
          src={api.fileUrl(file.id, true)}
          alt={file.name}
          loading="lazy"
          onClick={() => setPreview(true)}
        />
      )}

      <Modal
        open={preview}
        title={file.name}
        description={t("chat.artifact.meta", {
          size: formatBytes(file.size ?? 0),
          type: file.mime || t("chat.artifact.unknownType"),
        })}
        onClose={() => setPreview(false)}
        wide
        footer={
          <button className="btn" type="button" onClick={() => void downloadFileFromApi(file.id, file.name)}>
            <Download size={14} /> {t("chat.artifact.download")}
          </button>
        }
      >
        <div className="artifact-modal-body">
          <img src={api.fileUrl(file.id, true)} alt={file.name} />
        </div>
      </Modal>
    </div>
  );
}

/** Grid used for the artifacts of one assistant turn. */
export function ArtifactGrid({ files }: { files: FileRef[] }) {
  if (!files.length) return null;
  return (
    <div className="artifact-grid">
      {files.map((file) => (
        <ArtifactCard key={file.id} file={file} />
      ))}
    </div>
  );
}
