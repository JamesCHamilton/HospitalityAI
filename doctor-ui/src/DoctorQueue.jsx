import { motion, AnimatePresence } from "framer-motion";
import React, { useState } from "react";

export default function DoctorQueue({ doctors }) {

  const [queue, setQueue] = useState(doctors.slice(0,20));
  const [yesses, setYesses] = useState([]);

  const handleYes = (doctorId) => {
    setYesses(prev => [...prev, doctorId]);
    removeDoctor(doctorId);
  };

  const handleNo = (doctorId) => {
    removeDoctor(doctorId);
  };

  const removeDoctor = (doctorId) => {
    setQueue(prev => prev.filter(d => d.id !== doctorId));
  };

  return (
    <div style={styles.container}>

      <AnimatePresence>

        {queue.map((doc) => (

          <motion.div
            key={doc.id}

            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -100 }}

            transition={{ duration: 0.3 }}

            style={styles.card}
          >

            <div><b>Doctor ID:</b> {doc.id}</div>
            <div><b>Priority:</b> {doc.priority}</div>

            <div style={styles.buttons}>
              <button
                style={styles.yes}
                onClick={() => handleYes(doc.id)}
              >
                Yes
              </button>

              <button
                style={styles.no}
                onClick={() => handleNo(doc.id)}
              >
                No
              </button>
            </div>

          </motion.div>

        ))}

      </AnimatePresence>

    </div>
  );
}

const styles = {

  container: {
    height: "500px",
    width: "350px",
    overflowY: "scroll",
    border: "1px solid #ccc",
    padding: "10px"
  },

  card: {
    border: "1px solid #aaa",
    borderRadius: "10px",
    padding: "15px",
    marginBottom: "10px",
    backgroundColor: "#f9f9f9"
  },

  buttons: {
    marginTop: "10px",
    display: "flex",
    gap: "10px"
  },

  yes: {
    backgroundColor: "green",
    color: "white",
    padding: "6px 12px",
    cursor: "pointer"
  },

  no: {
    backgroundColor: "red",
    color: "white",
    padding: "6px 12px",
    cursor: "pointer"
  }

};