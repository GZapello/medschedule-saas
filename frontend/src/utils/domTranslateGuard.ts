/**
 * domTranslateGuard.ts
 *
 * Proteção global de integridade do reconciliador do React contra mutações
 * externas no DOM geradas por extensões de navegador e ferramentas nativas de
 * tradução automática (como Google Translate, Chrome Translation e Edge Translator).
 *
 * O mecanismo de tradução automática do Chromium/Google Translate manipula diretamente
 * nós de texto (TextNodes), substituindo-os ou envolvendo-os em elementos <font>.
 * Quando um estado do React muda ou um modal/portal desmonta, o Fiber do React tenta
 * invocar `parentNode.insertBefore(newNode, oldNode)` ou `parentNode.removeChild(oldNode)`
 * referenciando o TextNode original. Como o nó foi movido para dentro de um <font>
 * ou desanexado pelo tradutor, o navegador lança a exceção fatal:
 * "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node."
 * ou
 * "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node."
 *
 * Esta proteção intercepta as chamadas nativas de `insertBefore`, `removeChild` e
 * `replaceChild`, resolvendo o container direto correto ou aplicando um fallback
 * gracioso e seguro caso o nó tenha sido alterado externamente.
 */

export function installDomTranslateGuard(): void {
  if (typeof window === 'undefined' || typeof Node === 'undefined' || !Node.prototype) {
    return;
  }

  const proto = Node.prototype as any;
  if (proto.__zemdaDomTranslateGuardInstalled) {
    return;
  }
  proto.__zemdaDomTranslateGuardInstalled = true;

  const originalInsertBefore = proto.insertBefore;
  proto.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    // Caso padrão: referenceNode é nulo ou é filho direto de `this`
    if (!referenceNode || referenceNode.parentNode === this) {
      return originalInsertBefore.call(this, newNode, referenceNode) as T;
    }

    // Caso de intervenção de tradução: referenceNode não é filho direto de `this`
    // 1. Se referenceNode ainda é um descendente de `this` (ex.: envolvido por <font>),
    // localiza o filho direto de `this` que contém referenceNode para preservar a ordem.
    if (this.contains(referenceNode)) {
      let directChild: Node | null = referenceNode;
      while (directChild && directChild.parentNode && directChild.parentNode !== this) {
        directChild = directChild.parentNode;
      }
      if (directChild && directChild.parentNode === this) {
        return originalInsertBefore.call(this, newNode, directChild) as T;
      }
    }

    // 2. Se referenceNode foi desanexado do DOM ou pertence a outro ramo por mutação do tradutor,
    // insere no final de `this` (comportamento de appendChild), evitando a exceção fatal.
    try {
      return originalInsertBefore.call(this, newNode, null) as T;
    } catch {
      try {
        return this.appendChild(newNode) as T;
      } catch {
        return newNode;
      }
    }
  };

  const originalRemoveChild = proto.removeChild;
  proto.removeChild = function <T extends Node>(child: T): T {
    // Caso padrão: child é filho direto de `this`
    if (child && child.parentNode === this) {
      return originalRemoveChild.call(this, child) as T;
    }

    // Caso de intervenção de tradução: child não é filho direto de `this`
    // 1. Se child ainda é descendente de `this` (ex.: envolvido por <font>),
    // remove o container direto de `this` correspondente.
    if (child && this.contains(child)) {
      let directChild: Node | null = child;
      while (directChild && directChild.parentNode && directChild.parentNode !== this) {
        directChild = directChild.parentNode;
      }
      if (directChild && directChild.parentNode === this) {
        return originalRemoveChild.call(this, directChild) as T;
      }
    }

    // 2. Se child já foi desanexado ou removido pelo tradutor,
    // retorna com sucesso sem lançar NotFoundError.
    return child;
  };

  const originalReplaceChild = proto.replaceChild;
  proto.replaceChild = function <T extends Node>(newChild: Node, oldChild: T): T {
    // Caso padrão: oldChild é filho direto de `this`
    if (oldChild && oldChild.parentNode === this) {
      return originalReplaceChild.call(this, newChild, oldChild) as T;
    }

    // Caso de intervenção de tradução:
    if (oldChild && this.contains(oldChild)) {
      let directChild: Node | null = oldChild;
      while (directChild && directChild.parentNode && directChild.parentNode !== this) {
        directChild = directChild.parentNode;
      }
      if (directChild && directChild.parentNode === this) {
        return originalReplaceChild.call(this, newChild, directChild) as T;
      }
    }

    try {
      originalInsertBefore.call(this, newChild, null);
    } catch {
      try {
        this.appendChild(newChild);
      } catch {}
    }
    return oldChild;
  };
}
