import mime from 'mime-types';
import BabelInlineImportHelper from './helper';

function toDataURI(givenPath, reference) {
  const buffer = BabelInlineImportHelper.getContents(givenPath, reference);
  const mimeType = mime.lookup(givenPath) || 'application/octet-stream';
  return `data:${mimeType};base64,` + buffer.toString('base64');
}

export default function ({ types: t }) {
  class BabelInlineImportDataURI {
    constructor() {
      return {
        visitor: {
          CallExpression: {
            enter(path, state) {
              const extensions = state && state.opts && state.opts.extensions;
              let reference = state && state.file && state.file.opts.filename;

              const callee = path.get('callee');
              if (callee.isIdentifier() && callee.equals('name', 'require')) {
                const arg = path.get('arguments')[0];

                if (arg && arg.isStringLiteral()) {
                  const dataPath = arg.node.value;
                  if (BabelInlineImportHelper.shouldBeInlined(dataPath, extensions)) {
                    const dataURI = toDataURI(dataPath, reference);
                    path.replaceWith(t.stringLiteral(dataURI));
                  }
                }
              }
            }
          },
          ImportDeclaration: {
            exit(path, state) {

              const givenPath = path.node.source.value;
              let reference = state && state.file && state.file.opts.filename;
              const extensions = state && state.opts && state.opts.extensions;

              if (BabelInlineImportHelper.shouldBeInlined(givenPath, extensions)) {
                if (path.node.specifiers.length > 1) {
                  throw new Error(`Destructuring inlined import is not allowed. Check the import statement for '${givenPath}'`);
                }

                // Here we detect the use of Meteor by checking global.meteorBabelHelpers
                if (global.meteorBabelHelpers && BabelInlineImportHelper.hasRoot(reference)) {
                  reference = BabelInlineImportHelper.transformRelativeToRootPath(reference);
                }

                const id = path.node.specifiers[0].local.name;
                const dataURI = toDataURI(givenPath, reference);
                const variable = t.variableDeclarator(t.identifier(id), t.stringLiteral(dataURI));

                path.replaceWith({
                  type: 'VariableDeclaration',
                  kind: 'const',
                  declarations: [variable],
                  leadingComments: [
                    {
                      type: 'CommentBlock',
                      value: ` babel-plugin-inline-import '${givenPath}' `
                    }
                  ]
                });
              }
            }
          }
        }
      };
    }
  }

  return new BabelInlineImportDataURI();
}
