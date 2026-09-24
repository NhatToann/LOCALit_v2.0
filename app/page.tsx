'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

interface TestItem {
  id: number
  name: string
  created_at: string
}

export default function Home() {
  const [items, setItems] = useState<TestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient()
        const { data, error } = await supabase.from('test_items').select('*')

        if (error) {
          setError(error.message)
        } else {
          setItems(data || [])
        }
      } catch (err: unknown) {
        if (err instanceof Error) setError(err.message)
        else setError('Lỗi kết nối')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-8 bg-gray-50 text-black">
      <div className="w-full max-w-lg p-6 bg-white rounded-xl shadow-md border border-gray-200">
        <h1 className="text-2xl font-bold mb-2 text-blue-600 text-center">
          LOCALit x Supabase Test
        </h1>
        <p className="text-sm text-gray-500 mb-6 text-center">
          Trang kiểm tra kết nối Next.js và Supabase Database
        </p>

        {loading && (
          <div className="text-center py-4 text-gray-600 font-medium">
            ⏳ Đang truy vấn dữ liệu từ Supabase...
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
            ❌ <strong>Kết nối thất bại:</strong> {error}
          </div>
        )}

        {!loading && !error && (
          <div>
            <div className="flex items-center gap-2 mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm font-medium">
              ✅ Tích hợp thành công! Dữ liệu lấy từ Supabase:
            </div>

            <h2 className="font-semibold text-gray-700 mb-2">Danh sách bản ghi:</h2>
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="p-3 bg-gray-50 border border-gray-200 rounded-md flex justify-between items-center">
                  <span className="font-medium text-gray-800">#{item.id} - {item.name}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(item.created_at).toLocaleTimeString('vi-VN')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  )
}