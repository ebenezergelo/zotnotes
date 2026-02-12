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
              imageMarkdownPath: '../attachment/vaswani2017attention/image_1.png',
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

      ## Notes

      ### Yellow
      > The Transformer uses self-attention. (p. 3)
      > Comment: Key contribution

      ### Blue
      > Multi-head attention improves expressivity. (p. 4)
      > ![Selected area](../attachment/vaswani2017attention/image_1.png)
      "
    `);
  });
});
