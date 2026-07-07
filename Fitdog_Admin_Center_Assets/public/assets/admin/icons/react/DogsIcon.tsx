import * as React from "react";

export default function DogsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="5.5" cy="9" r="2"/><circle cx="9" cy="5.5" r="2"/><circle cx="15" cy="5.5" r="2"/><circle cx="18.5" cy="9" r="2"/><path d="M7 17c1.5-4 3-6 5-6s3.5 2 5 6c.7 2-1 4-3 3.2a5.2 5.2 0 0 0-4 0C8 21 6.3 19 7 17z"/>
    </svg>
  );
}
