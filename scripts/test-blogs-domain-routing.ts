import assert from "node:assert/strict";
import {
  BLOG_FITDOG_HOSTNAME,
  BLOG_PRIMARY_PUBLIC_ORIGIN,
  BLOG_PUBLIC_HOSTNAMES,
  BLOG_RUFFOPS_HOSTNAME,
  BLOGS_HOSTNAME,
  BLOGS_PUBLIC_ORIGIN,
  blogsCanonicalRedirectPath,
  blogsPublicPathFromInternal,
  legacyBlogRedirectUrl,
  rewriteBlogsPublicPath
} from "../lib/blogs-domain";
import { publicBlogHref } from "../lib/blog/public-path";
import { absoluteBlogUrl } from "../lib/blog/site-url";

assert.equal(BLOG_RUFFOPS_HOSTNAME, "blog.ruffops.com");
assert.equal(BLOG_FITDOG_HOSTNAME, "blog.fitdog.com");
assert.equal(BLOGS_HOSTNAME, "blogs.ruffops.com");
assert.deepEqual(BLOG_PUBLIC_HOSTNAMES, ["blog.ruffops.com", "blog.fitdog.com", "blogs.ruffops.com"]);
assert.equal(BLOG_PRIMARY_PUBLIC_ORIGIN, "https://blog.ruffops.com");
assert.equal(BLOGS_PUBLIC_ORIGIN, "https://blog.ruffops.com");

assert.equal(rewriteBlogsPublicPath(BLOG_RUFFOPS_HOSTNAME, "/"), "/blog");
assert.equal(rewriteBlogsPublicPath("staff.ruffops.com", "/"), null);

for (const host of BLOG_PUBLIC_HOSTNAMES) {
  assert.equal(rewriteBlogsPublicPath(host, "/articles"), "/blog/articles");
  assert.equal(rewriteBlogsPublicPath(host, "/my-article-slug"), "/blog/my-article-slug");
  assert.equal(rewriteBlogsPublicPath(host, "/admin"), null);
}

assert.equal(blogsPublicPathFromInternal("/blog"), "/");
assert.equal(blogsPublicPathFromInternal("/blog/articles"), "/articles");

assert.equal(blogsCanonicalRedirectPath(BLOG_RUFFOPS_HOSTNAME, "/blog"), "/");
assert.equal(blogsCanonicalRedirectPath(BLOG_RUFFOPS_HOSTNAME, "/blog/my-slug"), "/my-slug");

assert.equal(legacyBlogRedirectUrl("staff.ruffops.com", "/blog"), BLOG_PRIMARY_PUBLIC_ORIGIN);
assert.equal(legacyBlogRedirectUrl("fitdog.ruffops.com", "/blog/my-slug"), `${BLOG_PRIMARY_PUBLIC_ORIGIN}/my-slug`);
assert.equal(legacyBlogRedirectUrl(BLOG_RUFFOPS_HOSTNAME, "/blog"), null);
assert.equal(legacyBlogRedirectUrl("localhost", "/blog"), null);

assert.equal(publicBlogHref(), "/");
assert.equal(absoluteBlogUrl("/blog"), `${BLOG_PRIMARY_PUBLIC_ORIGIN}/`);
assert.equal(absoluteBlogUrl(publicBlogHref("sample-slug")), `${BLOG_PRIMARY_PUBLIC_ORIGIN}/sample-slug`);

console.log("test-blogs-domain-routing passed");
