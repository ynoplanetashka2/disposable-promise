export function ponyfillSymbol(symbolName: string): symbol {
    if (symbolName in Symbol && typeof (Symbol as any)[symbolName] === 'symbol') {
        return (Symbol as any)[symbolName] as symbol;
    }
    return `@@${symbolName}` as unknown as symbol;
}