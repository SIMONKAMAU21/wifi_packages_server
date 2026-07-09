import mongoose  from "mongoose"


export const connectDb = async()=>{
    try {
       const connect = await mongoose.connect(process.env.MONGO_URL) 
       console.warn(`Database connected: ${connect.connection.host}`)
    } catch (error) {
        console.log('error', error)
    }
}