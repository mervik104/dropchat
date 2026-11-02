import type { ComponentType } from "react";

import type { IconProps } from "./base";
import {
  ArchiveFileIcon,
  AudioFileIcon,
  DocFileIcon,
  FileIcon,
  ImageFileIcon,
  PdfFileIcon,
  VideoFileIcon,
} from "./files";

const EXTENSION_GROUPS: Record<string, ComponentType<IconProps>> = {
  png: ImageFileIcon,
  jpg: ImageFileIcon,
  jpeg: ImageFileIcon,
  gif: ImageFileIcon,
  webp: ImageFileIcon,
  avif: ImageFileIcon,
  svg: ImageFileIcon,
  mp4: VideoFileIcon,
  mov: VideoFileIcon,
  webm: VideoFileIcon,
  mkv: VideoFileIcon,
  mp3: AudioFileIcon,
  wav: AudioFileIcon,
  ogg: AudioFileIcon,
  flac: AudioFileIcon,
  m4a: AudioFileIcon,
  zip: ArchiveFileIcon,
  rar: ArchiveFileIcon,
  "7z": ArchiveFileIcon,
  tar: ArchiveFileIcon,
  gz: ArchiveFileIcon,
  pdf: PdfFileIcon,
  doc: DocFileIcon,
  docx: DocFileIcon,
  txt: DocFileIcon,
  md: DocFileIcon,
  rtf: DocFileIcon,
  csv: DocFileIcon,
  xls: DocFileIcon,
  xlsx: DocFileIcon,
};

export interface FileKindIconProps extends IconProps {
  fileName?: string | null;
  mime?: string | null;
}

export function FileKindIcon({
  fileName,
  mime,
  ...props
}: FileKindIconProps) {
  const extension = fileName?.split(".").pop()?.toLowerCase();
  const MimeGroup = mime?.split("/")[0];
  const Glyph =
    (extension ? EXTENSION_GROUPS[extension] : undefined) ??
    (MimeGroup === "image"
      ? ImageFileIcon
      : MimeGroup === "video"
        ? VideoFileIcon
        : MimeGroup === "audio"
          ? AudioFileIcon
          : FileIcon);

  return <Glyph {...props} />;
}
