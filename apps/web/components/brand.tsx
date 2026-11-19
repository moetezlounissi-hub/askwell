import Link from "next/link";
import { APP_NAME } from "@askwell/shared";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label={`${APP_NAME} home`}>
      <span className="brand-mark" aria-hidden="true">
        a
      </span>
      {APP_NAME}
      <span className="brand-dot" aria-hidden="true">
        ®
      </span>
    </Link>
  );
}
