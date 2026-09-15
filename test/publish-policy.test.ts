import {expect,it} from 'vitest'
import * as fs from 'node:fs'
import * as yaml from 'js-yaml'
it('only publishes reviewed main after the mandatory artifact and protocol gate',()=>{
 const workflow=yaml.load(fs.readFileSync('.github/workflows/publish.yml','utf8')) as any
 expect(workflow.permissions).toEqual({contents:'read'})
 expect(workflow.on.workflow_dispatch?.inputs?.skip_gate).toBeUndefined()
 const job=workflow.jobs.publish
 expect(job.if).toBe("github.ref == 'refs/heads/main'")
 const steps=job.steps as any[]
 const publish=steps.findIndex(s=>/npm publish/.test(s.run??''))
 const gate=steps.findIndex(s=>/npm run verify/.test(s.run??''))
 expect(gate).toBeGreaterThanOrEqual(0);expect(publish).toBeGreaterThan(gate)
 expect(steps[publish].run).not.toContain('--ignore-scripts')
 expect(steps[publish].env.NODE_AUTH_TOKEN).toContain('secrets.NPM_TOKEN')
 for(const step of steps){if(step.uses)expect(step.uses).toMatch(/@[0-9a-f]{40}$/)}
})
