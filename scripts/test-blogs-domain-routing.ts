import assert from "node:assert/strict";
import {
  BLOG_FITDOG_HOSTNAME,
  BLOG_PRIMARY_PUBLIC_ORIGIN,
  BLOG_PUBLIC_HOSTNAMES,
  BLOGS_HOSTNAME,
  BLOGS_PUBLIC_ORIGIN,
  blogsCanonicalRedirectPath,
  blogsPublicPathFromInternal,
  legacyBlogRedirectUrl,
  rewriteBlogsPublicPath
} from "../lib/blogs-domain";
import { publicBlogHref } from "../lib/blog/public-path";
import { absoluteBlogUrl } from "../lib/blog/site-url";

assert.equal(BLOG_FITDOG_HOSTNAME, "blog.fitdog.com");
assert.equal(BLOGS_HOSTNAME, "blogs.ruffops.com");
assert.deepEqual(BLOG_PUBLIC_HOSTNAMES, ["blog.fitdog.com", "blogs.ruffops.com"]);
assert.equal(BLOG_PRIMARY_PUBLIC_ORIGIN, "https://blog.fitdog.com");
assert.equal(BLOGS_PUBLIC_ORIGIN, "https://blog.fitdog.com");

for (const host of BLOG_PUBLIC_HOSTNAMES) {
  assert.equal(rewriteBlogsPublicPath(host, "/"), "/blog");
  assert.equal(rewriteBlogsPublicPath(host, "/articles"), "/blog/articles");
  assert.equal(rewriteBlogsPublicPath(host, "/category/summer"), "/blog/category/summer");
  assert.equal(rewriteBlogsPublicPath(host, "/my-article-slug"), "/blog/my-article-slug");
  assert.equal(rewriteBlogsPublicPath(host, "/rss.xml"), "/blog/rss.xml");
  assert.equal(rewriteBlogsPublicPath(host, "/sitemap.xml"), "/blog/sitemap.xml");
  assert.equal(rewriteBlogsPublicPath(host, "/admin"), null);
}

assert.equal(rewriteBlogsPublicPath("fitdog.ruffops.com", "/"), null);
assert.equal(rewriteBlogsPublicPath("www.fitdog.com", "/"), null);

assert.equal(blogsPublicPathFromInternal("/blog"), "/");
assert.equal(blogsPublicPathFromInternal("/blog/articles"), "/articles");
assert.equal(blogsPublicPathFromInternal("/blog/my-slug"), "/my-slug");

for (const host of BLOG_PUBLIC_HOSTNAMES) {
  assert.equal(blogsCanonicalRedirectPath(host, "/blog"), "/");
  assert.equal(blogsCanonicalRedirectPath(host, "/blog/articles"), "/articles");
  assert.equal(blogsCanonicalRedirectPath(host, "/blog/my-slug"), "/my-slug");
}

assert.equal(legacyBlogRedirectUrl("fitdog.ruffops.com", "/blog"), BLOG_PRIMARY_PUBLIC_ORIGIN);
assert.equal(legacyBlogRedirectUrl("fitdog.ruffops.com", "/blog/my-slug"), `${BLOG_PRIMARY_PUBLIC_ORIGIN}/my-slug`);
assert.equal(legacyBlogRedirectUrl("localhost", "/blog"), null);
assert.equal(legacyBlogRedirectUrl(BLOG_FITDOG_HOSTNAME, "/blog"), null);
assert.equal(legacyBlogRedirectUrl(BLOGS_HOSTNAME, "/blog"), null);

assert.equal(publicBlogHref(), "/");
assert.equal(publicBlogHref("/articles"), "/articles");
assert.equal(publicBlogHref("my-slug"), "/my-slug");
assert.equal(publicBlogHref("/category/summer"), "/category/summer");

assert.equal(absoluteBlogUrl("/blog"), `${BLOG_PRIMARY_PUBLIC_ORIGIN}/`);
assert.equal(absoluteBlogUrl("/blog/articles"), `${BLOG_PRIMARY_PUBLIC_ORIGIN}/articles`);
assert.equal(absoluteBlogUrl(publicBlogHref("sample-slug")), `${BLOG_PRIMARY_PUBLIC_ORIGIN}/sample-slug`);

console.log("test-blogs-domain-routing passed");
