import importlib.util,pathlib,unittest,tempfile,json,copy
from unittest.mock import patch
P=pathlib.Path(__file__).with_name('api-off-promotion.py')
if P.exists():
 spec=importlib.util.spec_from_file_location('promotion',P);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
else:m=None
class Host:
 def __init__(self,fail=None):self.events=[];self.fail=fail;self.committed=False
 def event(self,name):
  self.events.append(name)
  if name==self.fail:raise RuntimeError('synthetic failure')
 def preflight(self,p):self.event('preflight')
 def prepare(self,p):self.event('prepare')
 def start(self,p):self.event('start')
 def ready(self,p):self.event('ready')
 def switch(self,p):self.event('switch')
 def verify(self,p):self.event('verify')
 def commit(self,p):self.event('commit');self.committed=True
 def rollback(self):self.event('rollback')
class Promotion(unittest.TestCase):
 def setUp(self):self.assertIsNotNone(m,'Promotion controller missing')
 def test_success_leaves_verified_candidate_serving(self):
  h=Host();m.promote({},h);self.assertTrue(h.committed)
  self.assertEqual(h.events,['preflight','prepare','start','ready','switch','verify','commit'])
 def test_every_uncertain_mutation_rolls_back(self):
  for stage in ['start','ready','switch','verify','commit']:
   h=Host(stage)
   with self.subTest(stage=stage),self.assertRaises(RuntimeError):m.promote({},h)
   self.assertEqual(h.events[-1],'rollback');self.assertFalse(h.committed)
 def test_preflight_rejects_without_mutation(self):
  h=Host('preflight')
  with self.assertRaises(RuntimeError):m.promote({},h)
  self.assertEqual(h.events,['preflight'])
 def test_proxy_patch_changes_only_two_api_targets(self):
  before=b'api.staging.masarifiratibi.com;\nproxy_pass http://127.0.0.1:3000;\nproxy_pass http://127.0.0.1:3000;\nproxy_pass http://[::1]:3001;\n'
  after=m.promoted_config(before)
  self.assertEqual(after.replace(b'127.0.0.1:3001',b'127.0.0.1:3000'),before)
  self.assertIn(b'http://[::1]:3001',after)
  for invalid in [before.replace(b':3000;',b':4000;',1),before+b'proxy_pass http://127.0.0.1:3000;']:
   with self.assertRaises(RuntimeError):m.promoted_config(invalid)
 def test_atomic_route_write_preserves_unrelated_bytes_and_rejects_drift(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);site=root/'site';site.write_bytes(b'original')
   host=m.Host(root);host.read_json=lambda name:{'generation':'10000000-0000-4000-8000-000000000001'}
   with patch.object(m,'SITE',site):
    host.replace_route(b'candidate',b'original');self.assertEqual(site.read_bytes(),b'candidate')
    with self.assertRaises(RuntimeError):host.replace_route(b'bad',b'original')
    self.assertEqual(site.read_bytes(),b'candidate')
    host.replace_route(b'original',b'candidate');self.assertEqual(site.read_bytes(),b'original')
 def test_approval_cannot_outlive_window_or_authorize_financial_actions(self):
  spec=importlib.util.spec_from_file_location('fixture',P.with_name('api-off-qualification.test.py'));fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
  p=fixture.packet();p.update(kind='posting-off-api-promotion',candidateID='d'*64,candidateRestartPolicy='unless-stopped',deviceAuthority=None)
  p['approval']['kind']='direct-human-posting-off-promotion-approval';p['approval']['packetHash']=m.api.packet_hash(p)
  m.validate(p,1791756000)
  with self.assertRaises(RuntimeError):m.validate(p,1791756601)
  for key,value in [('financialAuthority',{}),('deviceAuthority',{}),('candidateRestartPolicy','always')]:
   changed=copy.deepcopy(p);changed[key]=value;changed['approval']['packetHash']=m.api.packet_hash(changed)
   with self.subTest(key=key),self.assertRaises(RuntimeError):m.validate(changed,1791756000)
 def test_committed_state_does_not_rollback_on_unit_completion(self):
  host=m.Host(pathlib.Path('.'));host.read_json=lambda name:{'kind':'posting-off-api-promotion','generation':'g','phase':'committed'}
  host.target=lambda *args,**kwargs:None
  host.run=lambda *args,**kwargs:self.fail('Committed promotion must remain serving')
  host.rollback()
if __name__=='__main__':unittest.main()
