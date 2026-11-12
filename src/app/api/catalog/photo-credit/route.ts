import { NextResponse } from "next/server";
import { commonsFilePageUrl, fetchCommonsCredit } from "@/lib/commons-credit";

/** Commons file names are page titles; anything longer or with these characters is not one. */
const MAX_FILE_NAME_CHARS = 240;
const INVALID_TITLE_CHARS = /[#<>[\]|{}\u0000-\u001f]/;

/**
 * Author and licence for a Commons photo, for client-side lightboxes and CoasterGuessr.
 * Only the Commons API is ever called, with the file name as a title, so the parameter cannot
 * point the server at another host.
 */
export async function GET(request: Request) {
  const fileName = new URL(request.url).searchParams.get("file")?.trim() ?? "";
  if (!fileName || fileName.length > MAX_FILE_NAME_CHARS || INVALID_TITLE_CHARS.test(fileName)) {
    return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
  }

  const credit = await fetchCommonsCredit(commonsFilePageUrl(fileName));
  return NextResponse.json(
    { credit },
    { headers: { "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=86400" } },
  );
}
