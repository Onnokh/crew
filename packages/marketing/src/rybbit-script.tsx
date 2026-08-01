import { useEffect } from "react";

const RYBBIT_SCRIPT_ID = "rybbit-analytics";
const RYBBIT_SITE_ID = import.meta.env.VITE_RYBBIT_SITE_ID;
const RYBBIT_SCRIPT_SRC =
  import.meta.env.VITE_RYBBIT_SCRIPT_SRC ??
  "https://rybbit.missingmounts.com/api/script.js";

/** Loads Rybbit only when this marketing build has been given a site ID. */
export function RybbitScript() {
  useEffect(() => {
    if (!RYBBIT_SITE_ID || document.getElementById(RYBBIT_SCRIPT_ID)) return;

    const script = document.createElement("script");
    script.id = RYBBIT_SCRIPT_ID;
    script.src = RYBBIT_SCRIPT_SRC;
    script.dataset.siteId = RYBBIT_SITE_ID;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  return null;
}
