"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Email search box that pushes `?search=` and resets to page 1. */
export function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("search") ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(params.toString());
    if (value.trim()) next.set("search", value.trim());
    else next.delete("search");
    next.delete("page");
    router.push(`/admin/users?${next.toString()}`);
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        type="search"
        placeholder="Search by email…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-9 w-64"
        aria-label="Search users by email"
      />
      <Button type="submit" variant="secondary" size="sm">
        Search
      </Button>
    </form>
  );
}
