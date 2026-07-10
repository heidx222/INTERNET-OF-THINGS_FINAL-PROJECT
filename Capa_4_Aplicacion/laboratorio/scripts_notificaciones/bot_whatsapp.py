# import sys
# import json
# import requests
# import os 
# from google import genai
# from google.genai import types

# # --- Configuración de Credenciales Protegidas ---
# GEMINI_API_KEY = os.getenv("AI_API_KEY")

# # Extraemos las variables de WhatsApp desde el contenedor Docker
# WA_INSTANCE = os.getenv("WA_INSTANCE", "123456")
# WA_TOKEN = os.getenv("WA_TOKEN", "tu_token_secreto")

# # Armamos la URL oficial de Green-API de forma dinámica
# WA_GATEWAY_URL = f"https://api.green-api.com/waInstance{WA_INSTANCE}/sendMessage/{WA_TOKEN}"

# # Número del encargado o grupo
# WA_RECIPIENT = os.getenv("WA_RECIPIENT", "51998062988@c.us")

# def consultar_gemini(pregunta_usuario):
#     """Genera respuestas contextuales simulando el rol de un ingeniero experto en la cuenca."""
#     try:
#         # Prompt de sistema para encuadrar la personalidad y límites de la IA (Mitigación de Alucinaciones)
#         contexto_seguridad = (
#             "Eres el asistente de Inteligencia Artificial del Sistema Autónomo de la Cuenca Chancay-Huaral. "
#             "Tu objetivo es asistir a los operadores de campo. Los umbrales del sistema son: "
#             "Nivel de peligro del río < 0.40m (Inundación/Huayco) y TDS > 500 ppm (Contaminación química). "
#             "Responde de forma concisa, técnica y orientada a la seguridad industrial."
#         )
        
#         response = client.models.generate_content(
#             model='gemini-2.5-flash',
#             contents=pregunta_usuario,
#             config=types.GenerateContentConfig(
#                 system_instruction=contexto_seguridad,
#                 temperature=0.3 # Baja temperatura para respuestas más precisas y menos creativas
#             )
#         )
#         return response.text
#     except Exception as e:
#         return f"Error al consultar al motor de IA (Gemini): {e}"

# def enviar_mensaje_whatsapp(texto):
#     """Despacha cualquier string formateado hacia el dispositivo móvil del operador."""
#     try:
#         payload = {"chatId": WA_RECIPIENT, "message": texto}
#         headers = {'Content-Type': 'application/json'}
#         response = requests.post(WA_GATEWAY_URL, json=payload, headers=headers, timeout=10)
#         return response.status_code == 200
#     except Exception as e:
#         print(f"[ERROR] No se pudo enviar el WhatsApp: {e}")
#         return False

# def procesar_evento(input_json):
#     """Detecta si el evento es una Alerta Automática o una Pregunta del Usuario."""
#     try:
#         data = json.loads(input_json)
        
#         # CASO 1: Es una alerta saliente generada por la Capa 3 (FastAPI)
#         if "comando" in data:
#             mensaje_alerta = (
#                 "🚨 *[ALERTA CRÍTICA - CUENCA CHANCAY]* 🚨\n"
#                 f"📍 *Origen:* {data.get('nodo_id', 'nodo_chancay_01')}\n"
#                 f"⚠️ *Diagnóstico IA:* {data.get('motivo', 'Anomalía Detectada')}\n"
#                 f"⚙️ *Acción Ejecutada:* {data.get('comando', 'N/A')}\n"
#                 "----------------------------------------\n"
#                 "💡 _Puedes responderme directamente a este chat si tienes dudas sobre los protocolos de mitigación._"
#             )
#             enviar_mensaje_whatsapp(mensaje_alerta)
            
#         # CASO 2: Es un mensaje entrante que un humano escribió en WhatsApp
#         elif "mensaje_usuario" in data:
#             pregunta = data["mensaje_usuario"]
#             # Solicitamos la respuesta a Gemini
#             respuesta_ia = consultar_gemini(pregunta)
            
#             formato_respuesta = (
#                 "🤖 *[Asistente IA Cuenca Chancay]*\n"
#                 "----------------------------------------\n"
#                 f"{respuesta_ia}"
#             )
#             enviar_mensaje_whatsapp(formato_respuesta)

#     except Exception as e:
#         print(f"[CRITICAL-ERROR] Error en el procesador del Bot: {e}")

# if __name__ == "__main__":
#     if len(sys.argv) > 1:
#         procesar_evento(sys.argv[1])
#     else:
#         print("[WARN] Ejecución sin argumentos válidos.")