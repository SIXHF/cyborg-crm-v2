import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";

export default async function RootPage() {
  const user = await getUser();
  if (user) {
    redirect("/leads");
  } else {
    redirect("/login");
  }
}
