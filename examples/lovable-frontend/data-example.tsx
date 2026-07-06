/**
 * CRUD + Realtime example against a `posts` table in Pluto.
 * Drop into `src/components/PlutoPosts.tsx`.
 *
 * SQL (run once in Pluto Dashboard → SQL Editor):
 *
 *   CREATE TABLE public.posts (
 *     id uuid primary key default gen_random_uuid(),
 *     user_id uuid references auth.users(id) on delete cascade,
 *     title text not null,
 *     created_at timestamptz default now()
 *   );
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
 *   ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "own posts" ON public.posts FOR ALL TO authenticated
 *     USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
 */
import { useEffect, useState } from "react";
import { pluto } from "@/lib/pluto";

type Post = { id: string; title: string; created_at: string };

export function PlutoPosts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [title, setTitle] = useState("");

  async function load() {
    const { data } = await pluto
      .from<Post>("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setPosts(data ?? []);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const user = pluto.auth.getUser().data.user;
    if (!user) return alert("Sign in first");
    await pluto.from("posts").insert({ title, user_id: user.id });
    setTitle("");
    load();
  }

  async function remove(id: string) {
    await pluto.from("posts").delete().eq("id", id);
    load();
  }

  useEffect(() => {
    load();
    const ch = pluto.realtime
      .channel("posts")
      .on("postgres_changes", { event: "*", table: "posts" }, load)
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, []);

  return (
    <div className="p-4 border rounded max-w-md">
      <form onSubmit={add} className="flex gap-2 mb-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New post title"
          className="flex-1 border rounded px-2 py-1"
        />
        <button type="submit">Add</button>
      </form>
      <ul className="space-y-1">
        {posts.map((p) => (
          <li key={p.id} className="flex justify-between border-b py-1">
            <span>{p.title}</span>
            <button onClick={() => remove(p.id)} aria-label="delete">
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
