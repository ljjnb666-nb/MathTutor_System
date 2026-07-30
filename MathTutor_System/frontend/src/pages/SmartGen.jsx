import SmartGenView from '../features/smart-gen/SmartGenView'
import { useSmartGenController } from '../features/smart-gen/useSmartGenController'

export default function SmartGen() {
  const controller = useSmartGenController()
  return <SmartGenView {...controller} />
}
