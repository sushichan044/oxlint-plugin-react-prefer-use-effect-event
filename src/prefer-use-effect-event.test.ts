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
        derivation: { kind: "call-return" },
      },
    ],
  },
] satisfies Options;

const directOptions = [
  {
    targets: [
      {
        source: { from: "package", package: "pkg", name: "notify" },
        derivation: { kind: "direct" },
      },
    ],
  },
] satisfies Options;

const callReturnPropertiesOptions = [
  {
    targets: [
      {
        source: { from: "package", package: "pkg", name: "useNotify" },
        derivation: { kind: "call-return-properties", properties: ["notify"] },
      },
    ],
  },
] satisfies Options;

function runRule(testCases: Parameters<typeof ruleTester.run>[2]): void {
  ruleTester.run("prefer-use-effect-event", preferUseEffectEvent, testCases);
}

describe("prefer-use-effect-event", () => {
  describe("call-return derivation", () => {
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

    it("ignores call-return when the binding is destructured", () => {
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

  describe("direct derivation", () => {
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
              options: directOptions,
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
              options: directOptions,
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
              options: directOptions,
            },
          ],
          invalid: [],
        });
      }).not.toThrow();
    });
  });

  describe("call-return-properties derivation", () => {
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
              options: callReturnPropertiesOptions,
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
              options: callReturnPropertiesOptions,
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
              options: callReturnPropertiesOptions,
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

  // `from: "file"` requires resolving import sources against a real `tsconfig.json` and walking
  // up to find an `.oxlintrc.json`, which `RuleTester` cannot stage in-memory. Coverage lives in
  // the dedicated resolver unit tests and the e2e fixture rigs.
});
