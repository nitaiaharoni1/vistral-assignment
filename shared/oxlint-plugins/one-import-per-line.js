const rule = {
  meta: {
    type: "layout",
    fixable: "code",
    messages: {
      oneImport: "Import one name per statement.",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.specifiers.length <= 1) return;
        context.report({
          node,
          messageId: "oneImport",
          fix(fixer) {
            const source = context.sourceCode.getText(node.source);
            return fixer.replaceText(node, node.specifiers.map((specifier) => printImport(specifier, source, node.importKind)).join("\n"));
          },
        });
      },
    };
  },
};

function printImport(specifier, source, declarationKind) {
  const typeOnly = declarationKind === "type" || specifier.importKind === "type";
  const keyword = typeOnly ? "import type" : "import";
  if (specifier.type === "ImportDefaultSpecifier") {
    return `${keyword} ${specifier.local.name} from ${source};`;
  }
  if (specifier.type === "ImportNamespaceSpecifier") {
    return `${keyword} * as ${specifier.local.name} from ${source};`;
  }
  const imported = importedName(specifier.imported);
  const local = specifier.local.name;
  const binding = imported === local ? imported : `${imported} as ${local}`;
  return `${keyword} { ${binding} } from ${source};`;
}

function importedName(imported) {
  if (imported.type === "Identifier") return imported.name;
  return imported.raw ?? JSON.stringify(imported.value);
}

export default {
  meta: { name: "vistral" },
  rules: { "one-import-per-line": rule },
};
