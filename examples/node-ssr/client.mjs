import { bootstrap } from "@taipa/ui/client";
import { Counter } from "./counter.mjs";

export { Counter };

bootstrap({
  registry: {
    Counter: {
      load: async () => ({ Counter }),
      exportName: "Counter",
    },
  },
});
