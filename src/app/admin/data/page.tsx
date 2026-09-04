import { redirect } from "next/navigation";

/** ThemeParks findings UI retired — catalog quality is the admin data home. */
export default function AdminDataRedirectPage() {
  redirect("/admin/data/catalog");
}
