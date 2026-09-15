import {expect,it} from 'vitest'
import {z as z3} from 'zod/v3'
import {toJsonSchema,validateArgs} from '../src/schema.js'

it('keeps installed Zod 3 module schemas usable after a server Zod 4 upgrade',()=>{
 const schema=z3.object({amount:z3.number().positive()})
 expect((toJsonSchema(schema) as any).properties.amount.type).toBe('number')
 expect(()=>validateArgs(schema,{amount:-1})).toThrow()
 expect(validateArgs(schema,{amount:3})).toEqual({amount:3})
})
it('validates a raw JSON schema before the module can receive malicious arguments',()=>{
 const schema={type:'object',properties:{amount:{type:'integer',minimum:1}},required:['amount'],additionalProperties:false}
 for(const args of [{amount:-1},{amount:'1'},{amount:1,privileged:true},{}])expect(()=>validateArgs(schema,args)).toThrow()
 expect(validateArgs(schema,{amount:2})).toEqual({amount:2})
})
it('does not advertise an invalid or unresolved argument-validation contract',()=>{
 expect(()=>toJsonSchema({type:7})).toThrow()
 expect(()=>toJsonSchema({type:'object',properties:{value:{$ref:'https://invalid.example/schema'}}})).toThrow()
})
it('keeps equal local schema identifiers independent across modules',()=>{
 const one={$id:'https://example.invalid/input',type:'object',properties:{value:{type:'number'}}}
 const two={$id:'https://example.invalid/input',type:'object',properties:{value:{type:'string'}}}
 toJsonSchema(one);toJsonSchema(two)
 expect(()=>validateArgs(one,{value:'text'})).toThrow()
 expect(validateArgs(two,{value:'text'})).toEqual({value:'text'})
})
it('does not keep stale validation after an explicitly changed JSON contract',()=>{
 const schema={type:'object',properties:{value:{type:'number'}}}
 toJsonSchema(schema);schema.properties.value.type='string'
 expect(()=>validateArgs(schema,{value:2})).toThrow()
 expect(validateArgs(schema,{value:'text'})).toEqual({value:'text'})
})
