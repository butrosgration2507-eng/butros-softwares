export const OS_LIST = ['Windows', 'macOS', 'Linux', 'Android', 'iOS', 'Web'] as const;

export const SW_SELECT = `s.id, s.slug, s.name, s.short_description, s.description, s.publisher, s.publisher_url,
  s.operating_systems, s.system_requirements, s.installation_instructions, s.version,
  to_char(s.release_date, 'YYYY-MM-DD') as release_date, s.size_bytes, s.icon_media_id, s.screenshot_media_ids,
  s.download_source, s.download_source_note, s.redistribution_confirmed, s.featured, s.status, s.published_at,
  s.created_at, s.updated_at, s.category_id, c.name as category_name, c.slug as category_slug`;
export const SW_FROM = `software s left join categories c on c.id = s.category_id`;

export function mapSoftware(r: any) {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    shortDescription: r.short_description,
    description: r.description,
    publisher: r.publisher,
    publisherUrl: r.publisher_url,
    category: r.category_id ? { id: r.category_id, name: r.category_name, slug: r.category_slug } : null,
    operatingSystems: r.operating_systems ?? [],
    systemRequirements: r.system_requirements,
    installationInstructions: r.installation_instructions,
    version: r.version,
    releaseDate: r.release_date,
    sizeBytes: r.size_bytes,
    iconUrl: r.icon_media_id ? `/media/${r.icon_media_id}` : null,
    iconMediaId: r.icon_media_id,
    screenshotUrls: (r.screenshot_media_ids ?? []).map((id: string) => `/media/${id}`),
    screenshotMediaIds: r.screenshot_media_ids ?? [],
    downloadSource: r.download_source,
    downloadSourceNote: r.download_source_note,
    redistributionConfirmed: r.redistribution_confirmed,
    featured: r.featured,
    status: r.status,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    downloads: r.downloads != null ? Number(r.downloads) : undefined,
  };
}

export function mapFile(r: any, admin = false) {
  const base = {
    id: r.id,
    label: r.label,
    fileName: r.file_name,
    sizeBytes: r.size_bytes,
    md5: r.md5,
    sha256: r.sha256,
    operatingSystem: r.operating_system,
    versionId: r.version_id,
    availability: r.availability,
  };
  if (!admin) return base;
  return {
    ...base,
    driveAccountId: r.drive_account_id,
    driveAccountEmail: r.account_email,
    driveFileId: r.drive_file_id,
    isPublic: r.is_public,
    lastCheckedAt: r.last_checked_at,
    mimeType: r.mime_type,
  };
}

export function mapVersion(r: any) {
  return { id: r.id, version: r.version, releaseDate: r.release_date, changelog: r.changelog, isCurrent: r.is_current, createdAt: r.created_at };
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
