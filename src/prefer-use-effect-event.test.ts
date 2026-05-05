import { RuleTester } from "oxlint/plugins-dev";
import type { Options } from "./prefer-use-effect-event";
import preferUseEffectEvent from "./prefer-use-effect-event";
import { describe, expect, it } from "vitest";

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: "module",
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
});

const callReturnOptions = [
  {
    targets: [
      {
        source: { from: "package", package: "react-router", name: "useNavigate" },
        handler: { kind: "call-return" },
      },
    ],
  },
] satisfies Options;

const valueOptions = [
  {
    targets: [
      {
        source: { from: "package", package: "pkg", name: "notify" },
        handler: { kind: "value" },
      },
    ],
  },
] satisfies Options;

const callReturnPropertyOptions = [
  {
    targets: [
      {
        source: { from: "package", package: "pkg", name: "useNotify" },
        handler: { kind: "call-return-property", properties: ["notify"] },
      },
    ],
  },
] satisfies Options;

function runRule(testCases: Parameters<typeof ruleTester.run>[2]): void {
  ruleTester.run("prefer-use-effect-event", preferUseEffectEvent, testCases);
}

describe("prefer-use-effect-event", () => {
  describe("call-return handler", () => {
    it("rewrites a useEffect that depends on a hook return value", () => {
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import { useEffect } from "react";
import { useNavigate } from "react-router";

const Component = () => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/path");
  }, [navigate]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "navigate" } }],
              output: `import { useEffect, useEffectEvent } from "react";
import { useNavigate } from "react-router";

const Component = () => {
  const navigate = useNavigate();
  const navigateEvent = useEffectEvent(navigate);
  useEffect(() => {
    navigateEvent("/path");
  }, []);
};`,
              options: callReturnOptions,
            },
          ],
        });
      }).not.toThrow();
    });

    it("works through `import as` rename of the source hook", () => {
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import { useEffect } from "react";
import { useNavigate as useNav } from "react-router";

const Component = () => {
  const navigate = useNav();
  useEffect(() => {
    navigate("/path");
  }, [navigate]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "navigate" } }],
              output: `import { useEffect, useEffectEvent } from "react";
import { useNavigate as useNav } from "react-router";

const Component = () => {
  const navigate = useNav();
  const navigateEvent = useEffectEvent(navigate);
  useEffect(() => {
    navigateEvent("/path");
  }, []);
};`,
              options: callReturnOptions,
            },
          ],
        });
      }).not.toThrow();
    });

    it("does not flag a same-named local function in an inner scope", () => {
      expect(() => {
        runRule({
          valid: [
            {
              // The `navigate` in deps is a local helper inside Component, NOT the
              // value returned from `useNavigate()`. The plugin must not touch this.
              code: `import { useEffect } from "react";
import { useNavigate } from "react-router";

const Component = () => {
  function navigate() {}
  useEffect(() => {
    navigate();
  }, [navigate]);
};`,
              options: callReturnOptions,
            },
          ],
          invalid: [],
        });
      }).not.toThrow();
    });

    it("ignores call-return handler when the binding is destructured", () => {
      expect(() => {
        runRule({
          valid: [
            {
              code: `import { useEffect } from "react";
import { useNavigate } from "react-router";

const Component = () => {
  const { navigate } = useNavigate();
  useEffect(() => {
    navigate();
  }, [navigate]);
};`,
              options: callReturnOptions,
            },
          ],
          invalid: [],
        });
      }).not.toThrow();
    });
  });

  describe("value handler", () => {
    it("rewrites a useEffect that depends on a directly imported handler", () => {
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import { useEffect } from "react";
import { notify } from "pkg";

const Component = () => {
  useEffect(() => {
    notify();
  }, [notify]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "notify" } }],
              output: `import { useEffect, useEffectEvent } from "react";
import { notify } from "pkg";

const Component = () => {
  const notifyEvent = useEffectEvent(notify);
  useEffect(() => {
    notifyEvent();
  }, []);
};`,
              options: valueOptions,
            },
          ],
        });
      }).not.toThrow();
    });

    it("works through `import as` rename for direct imports", () => {
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import { useEffect } from "react";
import { notify as alert } from "pkg";

const Component = () => {
  useEffect(() => {
    alert();
  }, [alert]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "alert" } }],
              output: `import { useEffect, useEffectEvent } from "react";
import { notify as alert } from "pkg";

const Component = () => {
  const alertEvent = useEffectEvent(alert);
  useEffect(() => {
    alertEvent();
  }, []);
};`,
              options: valueOptions,
            },
          ],
        });
      }).not.toThrow();
    });

    it("does not flag a shadowing local of the same name", () => {
      expect(() => {
        runRule({
          valid: [
            {
              code: `import { useEffect } from "react";
import { notify } from "pkg";

const Component = () => {
  const notify = () => {};
  useEffect(() => {
    notify();
  }, [notify]);
};`,
              options: valueOptions,
            },
          ],
          invalid: [],
        });
      }).not.toThrow();
    });
  });

  describe("call-return-property handler", () => {
    it("rewrites a useEffect that depends on a destructured property", () => {
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import { useEffect } from "react";
import { useNotify } from "pkg";

const Component = () => {
  const { notify } = useNotify();
  useEffect(() => {
    notify();
  }, [notify]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "notify" } }],
              output: `import { useEffect, useEffectEvent } from "react";
import { useNotify } from "pkg";

const Component = () => {
  const { notify } = useNotify();
  const notifyEvent = useEffectEvent(notify);
  useEffect(() => {
    notifyEvent();
  }, []);
};`,
              options: callReturnPropertyOptions,
            },
          ],
        });
      }).not.toThrow();
    });

    it("rewrites when the destructured property is renamed locally", () => {
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import { useEffect } from "react";
import { useNotify } from "pkg";

const Component = () => {
  const { notify: send } = useNotify();
  useEffect(() => {
    send();
  }, [send]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "send" } }],
              output: `import { useEffect, useEffectEvent } from "react";
import { useNotify } from "pkg";

const Component = () => {
  const { notify: send } = useNotify();
  const sendEvent = useEffectEvent(send);
  useEffect(() => {
    sendEvent();
  }, []);
};`,
              options: callReturnPropertyOptions,
            },
          ],
        });
      }).not.toThrow();
    });

    it("ignores destructured properties that are not in the configured list", () => {
      expect(() => {
        runRule({
          valid: [
            {
              code: `import { useEffect } from "react";
import { useNotify } from "pkg";

const Component = () => {
  const { warn } = useNotify();
  useEffect(() => {
    warn();
  }, [warn]);
};`,
              options: callReturnPropertyOptions,
            },
          ],
          invalid: [],
        });
      }).not.toThrow();
    });
  });

  describe("scope-aware behavior", () => {
    it("ignores calls to a same-named binding from another module", () => {
      expect(() => {
        runRule({
          valid: [
            {
              code: `import { useEffect } from "react";
import { useNavigate } from "other-pkg";

const Component = () => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate();
  }, [navigate]);
};`,
              options: callReturnOptions,
            },
          ],
          invalid: [],
        });
      }).not.toThrow();
    });

    it("does not rewrite calls of a same-named identifier inside an inner block", () => {
      // The fix should only rewrite call sites that resolve to the SAME variable
      // as the dependency. The inner `navigate` is a different variable.
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import { useEffect } from "react";
import { useNavigate } from "react-router";

const Component = () => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/outer");
    {
      const navigate = () => {};
      navigate();
    }
  }, [navigate]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "navigate" } }],
              output: `import { useEffect, useEffectEvent } from "react";
import { useNavigate } from "react-router";

const Component = () => {
  const navigate = useNavigate();
  const navigateEvent = useEffectEvent(navigate);
  useEffect(() => {
    navigateEvent("/outer");
    {
      const navigate = () => {};
      navigate();
    }
  }, []);
};`,
              options: callReturnOptions,
            },
          ],
        });
      }).not.toThrow();
    });
  });

  describe("experimental_useEffectEvent React versions", () => {
    it("reuses an existing experimental_useEffectEvent named import", () => {
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import { useEffect, experimental_useEffectEvent } from "react";
import { useNavigate } from "react-router";

const Component = () => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/path");
  }, [navigate]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "navigate" } }],
              output: `import { useEffect, experimental_useEffectEvent } from "react";
import { useNavigate } from "react-router";

const Component = () => {
  const navigate = useNavigate();
  const navigateEvent = experimental_useEffectEvent(navigate);
  useEffect(() => {
    navigateEvent("/path");
  }, []);
};`,
              options: callReturnOptions,
            },
          ],
        });
      }).not.toThrow();
    });

    it("reuses the local name when experimental_useEffectEvent is imported with `as`", () => {
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import { useEffect, experimental_useEffectEvent as useEffectEvent } from "react";
import { useNavigate } from "react-router";

const Component = () => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/path");
  }, [navigate]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "navigate" } }],
              output: `import { useEffect, experimental_useEffectEvent as useEffectEvent } from "react";
import { useNavigate } from "react-router";

const Component = () => {
  const navigate = useNavigate();
  const navigateEvent = useEffectEvent(navigate);
  useEffect(() => {
    navigateEvent("/path");
  }, []);
};`,
              options: callReturnOptions,
            },
          ],
        });
      }).not.toThrow();
    });
  });

  describe("default / namespace React import", () => {
    it("rewrites `React.useEffect` calls to use `React.useEffectEvent`", () => {
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import React from "react";
import { useNavigate } from "react-router";

const Component = () => {
  const navigate = useNavigate();
  React.useEffect(() => {
    navigate("/path");
  }, [navigate]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "navigate" } }],
              output: `import React from "react";
import { useNavigate } from "react-router";

const Component = () => {
  const navigate = useNavigate();
  const navigateEvent = React.useEffectEvent(navigate);
  React.useEffect(() => {
    navigateEvent("/path");
  }, []);
};`,
              options: callReturnOptions,
            },
          ],
        });
      }).not.toThrow();
    });

    it("works for `import * as React` namespace imports too", () => {
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import * as React from "react";
import { useNavigate } from "react-router";

const Component = () => {
  const navigate = useNavigate();
  React.useEffect(() => {
    navigate("/path");
  }, [navigate]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "navigate" } }],
              output: `import * as React from "react";
import { useNavigate } from "react-router";

const Component = () => {
  const navigate = useNavigate();
  const navigateEvent = React.useEffectEvent(navigate);
  React.useEffect(() => {
    navigateEvent("/path");
  }, []);
};`,
              options: callReturnOptions,
            },
          ],
        });
      }).not.toThrow();
    });

    it("respects an aliased default React import", () => {
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import R from "react";
import { useNavigate } from "react-router";

const Component = () => {
  const navigate = useNavigate();
  R.useEffect(() => {
    navigate("/path");
  }, [navigate]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "navigate" } }],
              output: `import R from "react";
import { useNavigate } from "react-router";

const Component = () => {
  const navigate = useNavigate();
  const navigateEvent = R.useEffectEvent(navigate);
  R.useEffect(() => {
    navigateEvent("/path");
  }, []);
};`,
              options: callReturnOptions,
            },
          ],
        });
      }).not.toThrow();
    });

    it("ignores `Other.useEffect` member calls that are not React", () => {
      expect(() => {
        runRule({
          valid: [
            {
              code: `import Other from "other-pkg";
import { useNavigate } from "react-router";

const Component = () => {
  const navigate = useNavigate();
  Other.useEffect(() => {
    navigate();
  }, [navigate]);
};`,
              options: callReturnOptions,
            },
          ],
          invalid: [],
        });
      }).not.toThrow();
    });

    it("uses the named useEffectEvent specifier when both default and named are imported", () => {
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import React, { useEffect } from "react";
import { useNavigate } from "react-router";

const Component = () => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/path");
  }, [navigate]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "navigate" } }],
              output: `import React, { useEffect, useEffectEvent } from "react";
import { useNavigate } from "react-router";

const Component = () => {
  const navigate = useNavigate();
  const navigateEvent = useEffectEvent(navigate);
  useEffect(() => {
    navigateEvent("/path");
  }, []);
};`,
              options: callReturnOptions,
            },
          ],
        });
      }).not.toThrow();
    });
  });

  describe("default import handler (name: 'default')", () => {
    const defaultValueOptions = [
      {
        targets: [
          {
            source: { from: "package", package: "axios", name: "default" },
            handler: { kind: "value" },
          },
        ],
      },
    ] satisfies Options;

    const defaultCallReturnOptions = [
      {
        targets: [
          {
            source: { from: "package", package: "create-client", name: "default" },
            handler: { kind: "call-return" },
          },
        ],
      },
    ] satisfies Options;

    it("rewrites a useEffect that depends on a default-imported value handler", () => {
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import { useEffect } from "react";
import axios from "axios";

const Component = () => {
  useEffect(() => {
    axios();
  }, [axios]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "axios" } }],
              output: `import { useEffect, useEffectEvent } from "react";
import axios from "axios";

const Component = () => {
  const axiosEvent = useEffectEvent(axios);
  useEffect(() => {
    axiosEvent();
  }, []);
};`,
              options: defaultValueOptions,
            },
          ],
        });
      }).not.toThrow();
    });

    it("works when the default import is locally renamed", () => {
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import { useEffect } from "react";
import http from "axios";

const Component = () => {
  useEffect(() => {
    http();
  }, [http]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "http" } }],
              output: `import { useEffect, useEffectEvent } from "react";
import http from "axios";

const Component = () => {
  const httpEvent = useEffectEvent(http);
  useEffect(() => {
    httpEvent();
  }, []);
};`,
              options: defaultValueOptions,
            },
          ],
        });
      }).not.toThrow();
    });

    it("rewrites a useEffect that depends on the return value of a default-imported call-return handler", () => {
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import { useEffect } from "react";
import createClient from "create-client";

const Component = () => {
  const client = createClient();
  useEffect(() => {
    client();
  }, [client]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "client" } }],
              output: `import { useEffect, useEffectEvent } from "react";
import createClient from "create-client";

const Component = () => {
  const client = createClient();
  const clientEvent = useEffectEvent(client);
  useEffect(() => {
    clientEvent();
  }, []);
};`,
              options: defaultCallReturnOptions,
            },
          ],
        });
      }).not.toThrow();
    });

    it("does not flag a default import from a different package", () => {
      expect(() => {
        runRule({
          valid: [
            {
              code: `import { useEffect } from "react";
import axios from "other-pkg";

const Component = () => {
  useEffect(() => {
    axios();
  }, [axios]);
};`,
              options: defaultValueOptions,
            },
          ],
          invalid: [],
        });
      }).not.toThrow();
    });
  });

  describe("event handler name conflict avoidance", () => {
    it("renames when an existing useEffectEvent wrapper already owns the default name", () => {
      // The user already wrapped an unrelated handler whose generated name happens to be
      // `navigateEvent`. Reusing that name would clash; the autofix coins `_1` instead.
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import { useEffect, useEffectEvent } from "react";
import { useNavigate } from "react-router";

const Component = ({ trackPage }) => {
  const navigate = useNavigate();
  const navigateEvent = useEffectEvent(() => trackPage("navigate"));
  useEffect(() => {
    navigate("/path");
    navigateEvent();
  }, [navigate, navigateEvent]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "navigate" } }],
              output: `import { useEffect, useEffectEvent } from "react";
import { useNavigate } from "react-router";

const Component = ({ trackPage }) => {
  const navigate = useNavigate();
  const navigateEvent = useEffectEvent(() => trackPage("navigate"));
  const navigateEvent_1 = useEffectEvent(navigate);
  useEffect(() => {
    navigateEvent_1("/path");
    navigateEvent();
  }, [navigateEvent]);
};`,
              options: callReturnOptions,
            },
          ],
        });
      }).not.toThrow();
    });

    it("renames when an imported binding of the default name is referenced inside the callback", () => {
      // Realistic outer-scope collision: an analytics constant imported under the same name
      // is referenced inside the effect. Declaring `navigateEvent` in component scope would
      // shadow that import for the in-callback reference.
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import { useEffect } from "react";
import { useNavigate } from "react-router";
import { navigateEvent } from "./analytics-events";

const Component = ({ track }) => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/path");
    track(navigateEvent);
  }, [navigate]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "navigate" } }],
              output: `import { useEffect, useEffectEvent } from "react";
import { useNavigate } from "react-router";
import { navigateEvent } from "./analytics-events";

const Component = ({ track }) => {
  const navigate = useNavigate();
  const navigateEvent_1 = useEffectEvent(navigate);
  useEffect(() => {
    navigateEvent_1("/path");
    track(navigateEvent);
  }, []);
};`,
              options: callReturnOptions,
            },
          ],
        });
      }).not.toThrow();
    });

    it("renames when a cleanup function inside the callback declares the default name", () => {
      // Realistic descendant-scope collision: the effect's cleanup function declares its own
      // local `navigateEvent`. Without renaming, the rewritten call site inside the cleanup
      // would resolve to that local instead of the wrapper.
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import { useEffect } from "react";
import { useNavigate } from "react-router";

const Component = ({ trackUnmount, cleanup }) => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/path");
    return () => {
      const navigateEvent = trackUnmount();
      cleanup(navigateEvent);
    };
  }, [navigate]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "navigate" } }],
              output: `import { useEffect, useEffectEvent } from "react";
import { useNavigate } from "react-router";

const Component = ({ trackUnmount, cleanup }) => {
  const navigate = useNavigate();
  const navigateEvent_1 = useEffectEvent(navigate);
  useEffect(() => {
    navigateEvent_1("/path");
    return () => {
      const navigateEvent = trackUnmount();
      cleanup(navigateEvent);
    };
  }, []);
};`,
              options: callReturnOptions,
            },
          ],
        });
      }).not.toThrow();
    });

    it("walks the suffix counter past existing useEffectEvent wrappers that share the prefix", () => {
      // After repeated rounds of this autofix on adjacent handlers, the user can end up with
      // a chain of `${name}Event` / `${name}Event_1` wrappers. A new fix must skip them all.
      expect(() => {
        runRule({
          valid: [],
          invalid: [
            {
              code: `import { useEffect, useEffectEvent } from "react";
import { useNavigate } from "react-router";

const Component = ({ trackPage, trackBack }) => {
  const navigate = useNavigate();
  const navigateEvent = useEffectEvent(() => trackPage());
  const navigateEvent_1 = useEffectEvent(() => trackBack());
  useEffect(() => {
    navigate("/path");
    navigateEvent();
    navigateEvent_1();
  }, [navigate, navigateEvent, navigateEvent_1]);
};`,
              errors: [{ messageId: "preferUseEffectEvent", data: { handlerName: "navigate" } }],
              output: `import { useEffect, useEffectEvent } from "react";
import { useNavigate } from "react-router";

const Component = ({ trackPage, trackBack }) => {
  const navigate = useNavigate();
  const navigateEvent = useEffectEvent(() => trackPage());
  const navigateEvent_1 = useEffectEvent(() => trackBack());
  const navigateEvent_2 = useEffectEvent(navigate);
  useEffect(() => {
    navigateEvent_2("/path");
    navigateEvent();
    navigateEvent_1();
  }, [navigateEvent, navigateEvent_1]);
};`,
              options: callReturnOptions,
            },
          ],
        });
      }).not.toThrow();
    });
  });

  // `from: "file"` requires resolving import sources against a real `tsconfig.json` and walking
  // up to find an `.oxlintrc.json`, which `RuleTester` cannot stage in-memory. Coverage lives in
  // the dedicated resolver unit tests and the e2e fixture rigs.
});
