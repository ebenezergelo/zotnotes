import { describe, expect, it } from 'vitest';
import { generateMarkdown } from '@/lib/markdown';

describe('generateMarkdown', () => {
  it('renders required template with abstract and color grouping', () => {
    const markdown = generateMarkdown({
      title: 'Attention Is All You Need',
      author: 'Vaswani, Ashish; Shazeer, Noam',
      year: '2017',
      company: 'Google',
      citeKey: 'vaswani2017attention',
      abstractText: 'This paper introduces the Transformer architecture.',
      groupedAnnotations: [
        {
          colorName: 'Yellow',
          annotations: [
            {
              key: 'ANN1',
              text: 'The Transformer uses self-attention.',
              comment: 'Key contribution',
              pageLabel: '3',
            },
          ],
        },
        {
          colorName: 'Blue',
          annotations: [
            {
              key: 'ANN2',
              text: 'Multi-head attention improves expressivity.',
              comment: '',
              pageLabel: '4',
              imageMarkdownPath: '@vaswani2017attention_1.png',
            },
          ],
        },
      ],
    });

    expect(markdown).toMatchInlineSnapshot(`
      "---
      tags:
        - type/source/paper
      Title: 'Attention Is All You Need'
      Author: 'Vaswani, Ashish; Shazeer, Noam'
      Year: '2017'
      Company: 'Google'
      ---

      Project:

      > [!INFO]
      > 
      > Abstract
      > 
      > This paper introduces the Transformer architecture.
      > 

      ## Annotations

      ### Yellow
      > The Transformer uses self-attention. ([p. 3](zotero://select/library/items/ANN1))
      > Comment: Key contribution

      ### Blue
      > Multi-head attention improves expressivity. ([p. 4](zotero://select/library/items/ANN2))
      > [[@vaswani2017attention_1.png]]
      "
    `);
  });

  it('separates annotations into independent blockquotes within a color section', () => {
    const markdown = generateMarkdown({
      title: '',
      author: '',
      year: '',
      company: '',
      citeKey: 'example',
      abstractText: '',
      groupedAnnotations: [
        {
          colorName: 'Yellow',
          annotations: [
            { key: 'A1', text: 'First', comment: '', pageLabel: '1' },
            { key: 'A2', text: 'Second', comment: '', pageLabel: '2' },
          ],
        },
      ],
    });

    expect(markdown).toContain(
      [
        '### Yellow',
        '> First ([p. 1](zotero://select/library/items/A1))',
        '',
        '> Second ([p. 2](zotero://select/library/items/A2))',
      ].join('\n'),
    );
  });

  it('respects custom frontmatter field order from template settings', () => {
    const markdown = generateMarkdown({
      title: 'My title',
      author: 'Doe, Jane',
      year: '2026',
      company: 'Acme Labs',
      citeKey: 'example',
      abstractText: '',
      groupedAnnotations: [],
      templateSettings: {
        propertyOrder: ['year', 'title', 'company', 'author'],
        colorHeadingOverrides: {},
      },
    });

    const yearIndex = markdown.indexOf("Year: '2026'");
    const titleIndex = markdown.indexOf("Title: 'My title'");
    const companyIndex = markdown.indexOf("Company: 'Acme Labs'");
    const authorIndex = markdown.indexOf("Author: 'Doe, Jane'");

    expect(yearIndex).toBeGreaterThan(0);
    expect(titleIndex).toBeGreaterThan(yearIndex);
    expect(companyIndex).toBeGreaterThan(titleIndex);
    expect(authorIndex).toBeGreaterThan(companyIndex);
  });

  it('uses color heading overrides when provided', () => {
    const markdown = generateMarkdown({
      title: '',
      author: '',
      year: '',
      company: '',
      citeKey: 'example',
      abstractText: '',
      groupedAnnotations: [
        {
          colorName: 'Yellow',
          annotations: [{ key: 'A1', text: 'First', comment: '', pageLabel: '1' }],
        },
      ],
      templateSettings: {
        propertyOrder: ['title', 'author', 'year', 'company'],
        colorHeadingOverrides: {
          Yellow: 'Disagree with author',
        },
      },
    });

    expect(markdown).toContain('### Disagree with author');
    expect(markdown).not.toContain('### Yellow');
  });
});
