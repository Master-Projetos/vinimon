import { configure } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Com vários agentes e a CI no mesmo processador, 1 s (padrão) estoura em `findBy*` de telas pesadas.
configure({ asyncUtilTimeout: 5_000 })
