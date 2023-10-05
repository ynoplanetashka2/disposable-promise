import { ponyfillSymbol } from '../../disposable-promise/utils/ponyfillSymbol';

describe('ponyfillSymbol', () => {
  it('should return corresponding symbol from global Symbol, if precent', () => {
    const precentedSymbolName = 'precentedSymbol';
    const precentedSymbol = Symbol(precentedSymbolName);
    (Symbol as any)[precentedSymbolName] = precentedSymbol;

    const ponyfilled = ponyfillSymbol(precentedSymbolName);
    expect(ponyfilled).toBe(precentedSymbol);

    delete (Symbol as any)[precentedSymbol];
  });

  it('should return string if corresponding symbol is not precent', () => {
    const notPrecentedSymbolName = 'notPrecentedSymbol';

    const ponyfilled = ponyfillSymbol(notPrecentedSymbolName);
    expect(ponyfilled).toBe(`@@${notPrecentedSymbolName}`);
  });
});
