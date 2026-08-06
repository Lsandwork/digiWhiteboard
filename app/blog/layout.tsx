import "./blog.css";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <div className="fitdog-blog min-h-screen">{children}</div>;
}
