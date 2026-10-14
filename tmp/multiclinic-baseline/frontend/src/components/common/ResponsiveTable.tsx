import React from 'react';

function textOf(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  if (Array.isArray(node)) return node.map(textOf).join(' ').trim();
  return '';
}

/** One set of controls/data: desktop table, labelled vertical row cards below 1024px. */
export function ResponsiveTable({ children, className = '', ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  const headers: string[] = [];
  function findHeaders(nodes: React.ReactNode, inHead = false) {
    React.Children.forEach(nodes, node => {
      if (!React.isValidElement<{ children?: React.ReactNode; colSpan?: number }>(node)) return;
      if (inHead && (node.type === 'th' || node.type === 'td')) {
        headers.push(textOf(node.props.children));
        for (let i = 1; i < (node.props.colSpan || 1); i++) headers.push('');
      } else findHeaders(node.props.children, inHead || node.type === 'thead');
    });
  }
  findHeaders(children);
  function labelRows(nodes: React.ReactNode, inBody = false): React.ReactNode {
    return React.Children.map(nodes, node => {
      if (!React.isValidElement<{ children?: React.ReactNode; colSpan?: number; 'data-label'?: string }>(node)) return node;
      if (node.type === 'tr' && inBody) {
        let column = 0;
        return React.cloneElement(node, {}, React.Children.map(node.props.children, cell => {
          if (!React.isValidElement<{ children?: React.ReactNode; colSpan?: number; 'data-label'?: string }>(cell)) return cell;
          const label = headers[column] || (cell.type === 'th' ? '' : '');
          column += cell.props.colSpan || 1;
          return React.cloneElement(cell, { 'data-label': cell.props['data-label'] ?? ((cell.props.colSpan || 1) > 1 ? '' : label) });
        }));
      }
      // Do not traverse arbitrary components or nested tables.
      if (typeof node.type !== 'string' || node.type === 'table') return node;
      return React.cloneElement(node, {}, labelRows(node.props.children, inBody || node.type === 'tbody' || node.type === 'tfoot'));
    });
  }
  return <table {...props} className={`zemda-responsive-table ${className}`}>{labelRows(children)}</table>;
}
