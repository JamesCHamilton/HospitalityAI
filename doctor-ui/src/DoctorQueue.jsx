import React, { useState } from "react";

export default function DoctorQueue({ doctors }) {

  const [queue, setQueue] = useState(doctors.slice(0,20));
  const [yesses, setYesses] = useState([]);

  const handleYes = (doctorId) => {
    setYesses(prev => [...prev, doctorId]);
    setQueue(prev => prev.filter(d => d.id !== doctorId));
  };

  const handleNo = (doctorId) => {
    setQueue(prev => prev.filter(d => d.id !== doctorId));
  };

  return (
    <div style={{height:"500px", overflowY:"scroll"}}>

      {queue.map(doc => (

        <div key={doc.id} style={{
          border:"1px solid gray",
          padding:"15px",
          margin:"10px"
        }}>

          <div>Doctor ID: {doc.id}</div>
          <div>Priority: {doc.priority}</div>

          <button onClick={()=>handleYes(doc.id)}>Yes</button>
          <button onClick={()=>handleNo(doc.id)}>No</button>

        </div>

      ))}

    </div>
  );
}