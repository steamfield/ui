import { createConsentStore, mountConsentBanner } from "@steamfield/ui/consent";
import { ConsentBanner, useConsent } from "@steamfield/ui/react/consent";
import { type ReactElement, useEffect, useState } from "react";

// `?delay=0` skips the page-load delay (the browser suite uses it). The DOM store shares its
// decision across *.steamfield.test, which tests/browser/consent.spec.ts maps to this server.
function delayParam(): number | undefined {
  const delay = new URLSearchParams(location.search).get("delay");
  return delay === null ? undefined : Number(delay);
}

function Decision({
  store,
  id,
}: {
  readonly store: ReturnType<typeof createConsentStore>;
  readonly id: string;
}): ReactElement {
  const { consent, reset } = useConsent(store);
  return (
    <p>
      Decision: <output id={id}>{consent ?? "undecided"}</output>{" "}
      <button type="button" onClick={reset}>
        Reset choice
      </button>
    </p>
  );
}

export function ConsentPage(): ReactElement {
  const [domStore] = useState(() =>
    createConsentStore({ cookieName: "pg-consent", domain: "steamfield.test" }),
  );
  const [reactStore] = useState(() => createConsentStore({ cookieName: "pg-consent-react" }));
  const [delayMs] = useState(delayParam);
  const timing = delayMs === undefined ? {} : { delayMs };

  useEffect(
    () =>
      mountConsentBanner(domStore, {
        privacyHref: "#/consent",
        ...(delayMs === undefined ? {} : { delayMs }),
      }),
    [domStore, delayMs],
  );

  return (
    <>
      <h1>consent</h1>
      <section className="pg-section" aria-labelledby="consent-dom">
        <h2 id="consent-dom">mountConsentBanner (fixed, bottom right)</h2>
        <p>Shared across *.steamfield.test; host-only anywhere else.</p>
        <Decision store={domStore} id="consent-dom-state" />
      </section>
      <section className="pg-section" aria-labelledby="consent-react">
        <h2 id="consent-react">React ConsentBanner (inline here)</h2>
        <Decision store={reactStore} id="consent-react-state" />
        <div className="pg-consent-inline">
          <ConsentBanner
            store={reactStore}
            label="Analytics consent (React)"
            message="This page counts visits without cookies until you choose."
            privacyHref="#/consent"
            {...timing}
          />
        </div>
      </section>
    </>
  );
}
