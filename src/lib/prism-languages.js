import Prism from "prismjs";
import "prismjs/components/prism-c.js";
import "prismjs/components/prism-cpp.js";
import "prismjs/components/prism-csharp.js";
import "prismjs/components/prism-python.js";
import "prismjs/components/prism-go.js";
import "prismjs/components/prism-rust.js";
import "prismjs/components/prism-sql.js";
import "prismjs/components/prism-swift.js";
import "prismjs/components/prism-kotlin.js";
import "prismjs/components/prism-objectivec.js";
import "prismjs/components/prism-typescript.js";
import "prismjs/components/prism-jsx.js";
import "prismjs/components/prism-tsx.js";
import "prismjs/components/prism-json.js";
import "prismjs/components/prism-markdown.js";
import "prismjs/components/prism-yaml.js";
import "prismjs/components/prism-bash.js";
import "prismjs/components/prism-docker.js";
import "prismjs/components/prism-makefile.js";
import "prismjs/components/prism-markup-templating.js";
import "prismjs/components/prism-php.js";
import "prismjs/components/prism-ruby.js";
import "prismjs/components/prism-powershell.js";
import "prismjs/components/prism-toml.js";
import "prismjs/components/prism-ini.js";
import "prismjs/components/prism-groovy.js";
import "prismjs/components/prism-gradle.js";
import "prismjs/components/prism-java.js";
import "prismjs/components/prism-scala.js";
import "prismjs/components/prism-lua.js";
import "prismjs/components/prism-perl.js";
import "prismjs/components/prism-r.js";
import "prismjs/components/prism-dart.js";
import "prismjs/components/prism-elixir.js";

const prismGlobal = typeof globalThis !== "undefined" ? globalThis : window;

if (!prismGlobal.Prism) {
  prismGlobal.Prism = Prism;
}

export { Prism };
