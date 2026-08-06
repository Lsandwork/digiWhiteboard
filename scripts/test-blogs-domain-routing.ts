import assert from "node:assert/strict";
import {
  BLOGS_HOSTNAME,
  BLOGS_PUBLIC_ORIGIN,
  blogsCanonicalRedirectPath,
  blogsPublicPathFromInternal,
  legacyBlogRedirectUrl,
  rewriteBlogsPublicPath
} from "../lib/blogs-domain";
import { publicBlogHref } from "../lib/blog/public-path";
import { absoluteBlogUrl } from "../lib/blog/site-url";

assert.equal(BLOGS_HOSTNAME, "blog.ruffops.com");
assert.equal(BLOGS_PUBLIC_ORIGIN, "https://blog.ruffops.com");

assert.equal(rewriteBlogsPublicPath(BLOGS_HOSTNAME, "/"), "/blog");
assert.equal(rewriteBlogsPublicPath(BLOGS_HOSTNAME, "/articles"), "/blog/articles");
assert.equal(rewriteBlogsPublicPath(BLOGS_HOSTNAME, "/category/summer"), "/blog/category/summer");
assert.equal(rewriteBlogsPublicPath(BLOGS_HOSTNAME, "/my-article-slug"), "/blog/my-article-slug");
assert.equal(rewriteBlogsPublicPath(BLOGS_HOSTNAME, "/rss.xml"), "/blog/rss.xml");
assert.equal(rewriteBlogsPublicPath(BLOGS_HOSTNAME, "/sitemap.xml"), "/blog/sitemap.xml");
assert.equal(rewriteBlogsPublicPath(BLOGS_HOSTNAME, "/admin"), null);
assert.equal(rewriteBlogsPublicPath("fitdog.ruffops.com", "/"), null);

assert.equal(blogsPublicPathFromInternal("/blog"), "/");
assert.equal(blogsPublicPathFromInternal("/blog/articles"), "/articles");
assert.equal(blogsPublicPathFromInternal("/blog/my-slug"), "/my-slug");

assert.equal(blogsCanonicalRedirectPath(BLOGS_HOSTNAME, "/blog"), "/");
assert.equal(blogsCanonicalRedirectPath(BLOGS_HOSTNAME, "/blog/articles"), "/articles");
assert.equal(blogsCanonicalRedirectPath(BLOGS_HOSTNAME, "/blog/my-slug"), "/my-slug");

assert.equal(legacyBlogRedirectUrl("fitdog.ruffops.com", "/blog"), BLOGS_PUBLIC_ORIGIN);
assert.equal(legacyBlogRedirectUrl("fitdog.ruffops.com", "/blog/my-slug"), `${BLOGS_PUBLIC_ORIGIN}/my-slug`);
assert.equal(legacyBlogRedirectUrl("localhost", "/blog"), null);
assert.equal(legacyBlogRedirectUrl(BLOGS_HOSTNAME, "/blog"), null);

assert.equal(publicBlogHref(), "/");
assert.equal(publicBlogHref("/articles"), "/articles");
assert.equal(publicBlogHref("my-slug"), "/my-slug");
assert.equal(publicBlogHref("/category/summer"), "/category/summer");

assert.equal(absoluteBlogUrl("/blog"), `${BLOGS_PUBLIC_ORIGIN}/`);
assert.equal(absoluteBlogUrl("/blog/articles"), `${BLOGS_PUBLIC_ORIGIN}/articles`);
assert.equal(absoluteBlogUrl(publicBlogHref("sample-slug")), `${BLOGS_PUBLIC_ORIGIN}/sample-slug`);

console.log("test-blogs-domain-routing passed");
